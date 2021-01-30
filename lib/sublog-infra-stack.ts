import * as cdk from '@aws-cdk/core';
import * as lambda from '@aws-cdk/aws-lambda'
import * as iam from '@aws-cdk/aws-iam'
import * as s3 from '@aws-cdk/aws-s3'
import * as s3n from '@aws-cdk/aws-s3-notifications'
import { Code, LayerVersion, Runtime, S3Code } from '@aws-cdk/aws-lambda';
import { BlockPublicAccess, NotificationKeyFilter } from '@aws-cdk/aws-s3'
import { Queue } from '@aws-cdk/aws-sqs'
import { SqsEventSource } from '@aws-cdk/aws-lambda-event-sources';
import * as secretsmanager from '@aws-cdk/aws-secretsmanager';
import { Trail, ReadWriteType } from '@aws-cdk/aws-cloudtrail';
/**
 * ↓ なぜかこれを要求される。。
 */
import { Duration } from '@aws-cdk/aws-cloudwatch/node_modules/@aws-cdk/core'

/**
 * sublog の AWS インフラを AWS CDK で IaC するためのコード。
 * ap-northeast-1 リージョン用
 */
export class SublogInfraStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    /**
     * 記事入稿/メタデータ削除 処理用の Lambda に権限を付与するロールを作成するセクション
     */
    const executionLambdaRole = new iam.Role(this, 'sublogLambdaExecutionRole', {
      roleName: 'sublogLambdaExecutionRole',
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSQSFullAccess'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('SecretsManagerReadWrite'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonDynamoDBFullAccess'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonS3ReadOnlyAccess'),
      ]})

     /**
      * シンタックスハイライター Lambda 用ロールを作成
      */
    const highlighterLambdaRole = new iam.Role(this, 'sublogHighlighterLambdaRole', {
      roleName: 'sublogHighlighterLambdaRole',
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaSQSQueueExecutionRole'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('SecretsManagerReadWrite'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonDynamoDBFullAccess'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonS3ReadOnlyAccess'),
      ]})


    /**
     * 記事のシンタックスハイライター Lambda が依存する Layer
     */
    const sublogHighlighterLayer = new LayerVersion(this, 'sublogHighlighterLayer', {
      compatibleRuntimes: [Runtime.NODEJS_12_X],
      code: Code.fromAsset('layer/nodejs')
    })



    /**
     * 記事入稿 Lambda ソースコードを格納する S3 バケットのインポートセクション
     */
    const srcBucket = s3.Bucket.fromBucketName(this, "srcBucket", "sublog-src")

    /**
     * 記事入稿用 Lambda セクション
     */
    const sublog_upsert_Lambda = new lambda.Function(this, 'sublog-upsert-meta-record', {
      functionName: 'sublog-upsert-meta-record',
      runtime: lambda.Runtime.GO_1_X,
      code: (new S3Code(srcBucket, "lambda/upsert/main.zip")),
      handler: 'main',
      role: executionLambdaRole,
      timeout: Duration.seconds(30)
    });

    /**
     * 記事メタデータ削除用 Lambda セクション
     */
    const sublog_delete_Lambda = new lambda.Function(this, 'sublog-delete-meta-record', {
      functionName: 'sublog-delete-meta-record',
      runtime: lambda.Runtime.GO_1_X,
      code: (new S3Code(srcBucket, "lambda/delete/main.zip")),
      handler: 'main',
      role: executionLambdaRole,
      timeout: Duration.seconds(30)
    });

    /**
     * 記事シンタックスハイライター Lambda セクション
     */
    const sublog_highlighter_Lambda = new lambda.Function(this, 'sublog-highlight-record', {
      functionName: 'sublog-highlight-record',
      runtime: lambda.Runtime.NODEJS_12_X,
      code: lambda.AssetCode.fromAsset('src/highlight/src'),
      handler: 'index.handler',
      role: highlighterLambdaRole,
      layers: [sublogHighlighterLayer],
      timeout: Duration.seconds(30)
    });

    /**
     * 記事入稿データ保管用の S3 バケット作成セクション
     */
    const assetsBucket = new s3.Bucket(this, 'assetsBucket', {
      bucketName: "sublog-assets",
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
    })

    /**
     * Cloudinary 用のバケットポリシーを設定
     * FIXME: デプロイ挙動があやしい
     */
    new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      principals: [new iam.AccountPrincipal('232482882421')],
      actions: ['s3:GetObject'],
      resources: [assetsBucket.bucketArn + '/public/*']
    })

    /**
     * CloudTrail イベント格納 S3 バケット
     */
    const trailBucket = new s3.Bucket(this, 'trailBucket', {
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
    })

    /**
     * trail 用バケットのバケットポリシーを設定
     * https://docs.aws.amazon.com/ja_jp/awscloudtrail/latest/userguide/create-s3-bucket-policy-for-cloudtrail.html
     */
    new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      principals: [new iam.ServicePrincipal('cloudtrail.amazonaws.com')],
      actions: ['s3:GetBucketAcl'],
      resources: [trailBucket.bucketArn]
    })

    new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      principals: [new iam.ServicePrincipal('cloudtrail.amazonaws.com')],
      actions: ['s3:PutObject'],
      resources: [trailBucket.bucketArn + '/AWSLogs/' + this.account + '/*'],
      conditions: {"StringEquals": {"s3:x-amz-acl": "bucket-owner-full-control"}}
    })

    /**
     * trail を作成
     */
    const trail = new Trail(this, 'trail', {
      bucket: trailBucket
    })

   /**
    * ↑ の trail に、出力したい S3 DataEvent のフィルター設定を追加する
    */
    trail.addS3EventSelector([{
      bucket: assetsBucket,
    }],{
      /**
       * PutObject/ DeleteObjects について、それぞれ
       * managementEvent: 0 (つまり DataEvent ) かつ
       * readOnly: 0 (つまり書き込みイベント)
       * を出力するように設定(Logs Insights にもこれを設定してフィルタリングする)
       */
      includeManagementEvents: false,
      readWriteType: ReadWriteType.WRITE_ONLY
    })

    /**
     * S3 Event Notification の プレフィックス/サフィックス を定義
     */
    const metaNotificationFilter: NotificationKeyFilter = { prefix: 'meta/', suffix: '.toml' }

    /**
     * S3 Event Notification を定義
     */
    assetsBucket.addEventNotification(
      s3.EventType.OBJECT_CREATED, new s3n.LambdaDestination(sublog_upsert_Lambda), metaNotificationFilter
    )

    assetsBucket.addEventNotification(
      s3.EventType.OBJECT_REMOVED, new s3n.LambdaDestination(sublog_delete_Lambda), metaNotificationFilter
    )

    /**
     * SQS キュー作成とトリガー Lambda 設定
     */
    const sublogQueue = new Queue(this, 'sublogQueue', {})
    sublog_highlighter_Lambda.addEventSource(new SqsEventSource(sublogQueue))

    /**
     * SQS キューポリシー作成
     */
    const sublogQueuePolicy = new iam.PolicyStatement()
    sublogQueuePolicy.addActions("SQS:SendMessage")
    sublogQueuePolicy.addResources(sublogQueue.queueArn)
    sublogQueuePolicy.addPrincipals(
       new iam.ServicePrincipal('lambda.amazonaws.com')),
    sublogQueue.addToResourcePolicy(sublogQueuePolicy)

    /**
     * SQS の URL をシークレトマネージャー出力
     */
    new secretsmanager.Secret(this, 'sublogHighlighterSQS', {
      secretName: 'sublogHighlighterSQS',
      generateSecretString: {
        secretStringTemplate:JSON.stringify({url: sublogQueue.queueUrl}),
        generateStringKey: 'password',
    }})
  }
}

const app = new cdk.App();
new SublogInfraStack(app, 'sublogInfra');
app.synth();