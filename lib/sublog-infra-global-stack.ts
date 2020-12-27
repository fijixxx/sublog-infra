import * as cdk from '@aws-cdk/core';
import * as lambda from '@aws-cdk/aws-lambda'
import * as iam from '@aws-cdk/aws-iam'

/**
 * sublog のグローバルインフラ（CloudFront など）で使用するリソースを作成するためのコード。
 * AWS のグローバルリソースは us-east1 へ配置することになっているため、スタックをこちらに分けている
 */
export class SublogInfraStackGlobal extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    /**
     * CloudFront の Origin Request 時に実行する Lambda に付与する権限を作成
     */
    const redirectLambdaRole = new iam.Role(this, 'sublogEdgeRedirectRole', {
      roleName: 'sublogEdgeRedirectRole',
      assumedBy: new iam.CompositePrincipal(
        new iam.ServicePrincipal('lambda.amazonaws.com'),
        new iam.ServicePrincipal('edgelambda.amazonaws.com')),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSAppSyncPushToCloudWatchLogs'),
      ]
    })

    /**
     * CloudFront の Origin Request 時に実行する Lambda を定義
     * Next.js で生成された静的ウェブページは、ルーティングを JS で行っているため、
     * 無対策だとリロード時などにブラウザのルーティングパスでは実ファイルを参照することができずにエラーとなる。
     * この Lambda によって、ブラウザのルーティングパスから S3 の実ファイルを取得できるようにする。
     * FIXME: 現状、既存の CloudFront に behavior だけを足すことができないため、Lambda デプロイ後に手動で Edge へのデプロイが必要
     *        CloudFront ごと CDK で新規作成すれば Edge の設定も同時に CDK で行えるため、いつか修正
     */
    new lambda.Function(this, 'sublog-edge-lambda-for-redirect', {
      functionName: 'sublog-edge-lambda-for-redirect',
      runtime: lambda.Runtime.NODEJS_12_X,
      code: lambda.AssetCode.fromAsset('src/redirect'),
      handler: 'index.handler',
      role: redirectLambdaRole,
    });
  }
}

const app = new cdk.App();
new SublogInfraStackGlobal(app, 'sublogInfraGlobal', {env: {region:'us-east-1'}});
app.synth();