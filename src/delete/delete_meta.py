import boto3
import logging
import requests
import json
import ast

logger = logging.getLogger()
logger.setLevel(logging.INFO)


def lambda_handler(event, context):
    """S3 バケットから .toml ファイルが削除されると発行される通知を受け取り、
    対象のファイル名と紐付いた DynamoDB レコードを削除する関数
    """
    # SecretsManager から、通知先 url を取得
    secrets_client = boto3.client('secretsmanager')
    raw_secret = secrets_client.get_secret_value(
        SecretId='sublog_discord_url',
    )['SecretString']
    # Key 指定で value を取得できないので注意(おそらく SecretsManager 特有)
    # FYI: https://dev.classmethod.jp/articles/secrets_manager_tips_get_api_key/
    secret = ast.literal_eval(raw_secret)
    url = secret['url']

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
        notification_content = create_notification_content(
            __file__, '## Exception')
        post_notification(url, notification_content, logger)
        raise
    notification_content = create_notification_content(
        __file__, '以下の内容で記事メタデータを削除しました\r id: %s \r fileName: %s' % (target_id, file_name))
    post_notification(url, notification_content, logger)
    return True


def post_notification(_url, _content, logger):
    """処理結果通知の実行関数
    TODO あとで Layer に切り出す
    Args:
      _url(string): ポスト先のURL
      _content(string): ポストする内容
      logger(Logger)
    """
    try:
        requests.post(
            _url,
            json.dumps({'content': _content}),
            headers={'Content-Type': 'application/json'}
        )
    except Exception as e:
        logger.exception("## Exception")
        logger.exception(e)
        raise

    return True


def create_notification_content(_filename, _content):
    """結果通知のメッセージ内容を作る
    Args:
      _filename(string): 通知元のファイル名
      _content(string): 通知する内容
    Returns:
      string: 平文の内容を返す

    """
    notification_content = 'Message from %s : %s' % (_filename, _content)

    return notification_content
