import * as cdk from '@aws-cdk/core';
import * as iam from '@aws-cdk/aws-iam'
import * as s3 from '@aws-cdk/aws-s3'

import { AssetCode, Function, Runtime, Code, LayerVersion} from '@aws-cdk/aws-lambda'
import { RestApi, LambdaIntegration, IResource, MockIntegration, PassthroughBehavior} from '@aws-cdk/aws-apigateway'
export class SublogInfraStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const executionLambdaRole = new iam.Role(this, 'sublogLambdaExecutionRole', {
      roleName: 'sublogLambdaExecutionRole',
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('SecretsManagerReadWrite'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonDynamoDBFullAccess'),
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonS3ReadOnlyAccess'),
      ]})

    const sublogLambdaLayer = new LayerVersion(this, 'sublogLayer', {
      compatibleRuntimes: [Runtime.PYTHON_3_8],
      code: Code.fromAsset('layer')
    })

    const sublogLambda = new Function(this, 'sublog-create-meta-record', {
      functionName: 'sublog-create-meta-record',
      runtime: Runtime.PYTHON_3_8,
      code: AssetCode.fromAsset('src'),
      handler: 'create_meta.lambda_handler',
      role: executionLambdaRole,
      layers: [sublogLambdaLayer]
    });

    // meta/*.md, text/*.txt 格納用バケット
    new s3.Bucket(this, 'assetsBucket', {
      bucketName: "sublog-assets"
    })

    // api 作成
    const sublogapi = new RestApi(this, "sublog", {
      restApiName: 'sublog API',
      description: 'sublog API'
    })

    // Lambda Integration 作成
    const createRecordIntegration = new LambdaIntegration(sublogLambda)

    const sublogactions = sublogapi.root.addResource('githubactions')

    sublogactions.addMethod('GET', createRecordIntegration)
    addCorsOptions(sublogactions)
}
}

export function addCorsOptions(apiResoucce: IResource){
  apiResoucce.addMethod(
    'OPTIONS',
    new MockIntegration({
      integrationResponses: [
        {
          statusCode: "200",
          responseParameters: {
            "method.response.header.Access-Control-Allow-Headers":
            "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-Amz-User-Agent'",
            "method.response.header.Access-Control-Allow-Origin": "'*'",
            "method.response.header.Access-Control-Allow-Credentials":
            "'false'",
            "method.response.header.Access-Control-Allow-Methods":
            "'OPTIONS,GET,PUT,POST,DELETE'",
          },
        },
      ],
      passthroughBehavior: PassthroughBehavior.NEVER,
      requestTemplates: {
        "application/json": '{"statusCode": 200}',
      },
    }),  {
    methodResponses: [
      {
      statusCode: "200",
        responseParameters: {
        "method.response.header.Access-Control-Allow-Headers": true,
        "method.response.header.Access-Control-Allow-Methods": true,
        "method.response.header.Access-Control-Allow-Credentials": true,
        "method.response.header.Access-Control-Allow-Origin": true,
        },
      },
    ],
  }
  )
}

const app = new cdk.App();
new SublogInfraStack(app, 'sublogInfra');
app.synth();