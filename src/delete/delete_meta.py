import boto3
import logging

logger = logging.getLogger()
logger.setLevel(logging.INFO)


def lambda_handler(event, context):
    """S3 バケットから .toml ファイルが削除されると発行される通知を受け取り、
    対象のファイル名と紐付いた DynamoDB レコードを削除する関数
    """

    # s3 notification から、 delete されたファイルの名前を取得
    file_name = event['Records'][0]['s3']['object']['key'][5:-5]
    logger.info('## ファイルネーム')
    logger.info('fileName: ' + file_name)

    # file_name を持つ DynamoDB レコードを探す
    dynamodb_client = boto3.client('dynamodb')
    dynamodb_response = dynamodb_client.query(
        TableName='sublog',
        IndexName='fileName-index',
        KeyConditionExpression='fileName = :fileName',
        ExpressionAttributeValues={':fileName': {'S': file_name}})

    records_count = dynamodb_response['Count']

    logger.info('## Count')
    logger.info('Count: ' + str(records_count))

    # ファイル名と紐付いたレコードが1件も存在しなければ、何もせずに終了
    if records_count < 1:
        return True
    # レコードが存在していた場合、Pキーである id の値を取得
    record = dynamodb_response['Items'][0]
    target_id = record['id']['S']

    # # DynamoDB からメタレコードを削除
    dynamodb = boto3.resource('dynamodb')

    try:
        table = dynamodb.Table('sublog')
        logger.info('## delete')
        logger.info(file_name)
        table.delete_item(
            Key={'id': target_id}
        )
    except Exception as e:
        logger.exception('## Exception')
        logger.exception(e)
        raise
    return True
