
from models import models
import requests
import json
import ast
import toml
import boto3
import random
import datetime
import uuid
import logging

logger = logging.getLogger()
logger.setLevel(logging.INFO)


def lambda_handler(event, context):
    """メタデータ.toml が対象 S3 に PUT されるたびに EventNotifications でキックされ、
    メタデータ.toml のファイル名と DynamoDB レコードの fileName 項目を突合した結果に応じて、
    DynamoDB レコードに対して upsert 処理を行う関数
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

    # s3 notification から、 put されたファイルの名前を取得
    file_name = event['Records'][0]['s3']['object']['key'][5:-5]
    logger.info('## ファイルネーム')
    logger.info('fileName: ' + file_name)

    # ついでにバケット名取得（.toml ファイル取得時に使用）
    bucket_name = event['Records'][0]['s3']['bucket']['name']

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

    # バケットからファイルの中身を取得
    s3_client = boto3.client('s3')

    Key = 'meta/' + file_name + '.toml'
    dicted_file = ''
    try:
        raw_file = s3_client.get_object(
            Bucket=bucket_name, Key=Key)['Body'].read().decode('utf-8')
        dicted_file = toml.loads(raw_file, _dict=dict)
    except Exception as e:
        logger.exception('## Exception')
        logger.exception(e)
        notification_content = create_notification_content(
            __file__, '## Exception')
        post_notification(url, notification_content, logger)
        raise

    # レコード作成
    color_name_list = ['Indianred', 'Lightcoral', 'Salmon', 'Darksalmon', 'Lightsalmon', 'Crimson', 'Red', 'Firebrick', 'Darkred', 'Pink', 'Lightpink', 'Hotpink', 'Deeppink', 'Mediumvioletred', 'Palevioletred', 'Lightsalmon', 'Coral', 'Tomato', 'Orangered', 'Darkorange', 'Orange', 'Gold', 'Yellow', 'Lightyellow', 'Lemonchiffon', 'Lightgoldenrodyellow', 'Papayawhip', 'Moccasin', 'Peachpuff', 'Palegoldenrod', 'Khaki', 'Darkkhaki', 'Greenyellow', 'Chartreuse', 'Lawngreen', 'Lime', 'Limegreen', 'Palegreen', 'Lightgreen', 'Mediumspringgreen', 'Springgreen', 'Mediumseagreen', 'Seagreen', 'Forestgreen', 'Green', 'Darkgreen', 'Yellowgreen', 'Olivedrab', 'Olive', 'Darkolivegreen', 'Mediumaquamarine', 'Darkseagreen', 'Lightseagreen', 'Darkcyan', 'Teal', 'Aqua', 'Cyan', 'Lightcyan', 'Paleturquoise', 'Aquamarine', 'Turquoise', 'Mediumturquoise', 'Darkturquoise', 'Cadetblue', 'Steelblue', 'Lightsteelblue', 'Powderblue', 'Lightblue',
                       'Skyblue', 'Lightskyblue', 'Deepskyblue', 'Dodgerblue', 'Cornflowerblue', 'Mediumslateblue', 'Royalblue', 'Blue', 'Mediumblue', 'Darkblue', 'Navy', 'Midnightblue', 'Lavender', 'Thistle', 'Plum', 'Violet', 'Orchid', 'Fuchsia', 'Magenta', 'Mediumorchid', 'Mediumpurple', 'Rebeccapurple', 'Blueviolet', 'Darkviolet', 'Darkorchid', 'Darkmagenta', 'Purple', 'Indigo', 'Slateblue', 'Darkslateblue', 'Mediumslateblue', 'Cornsilk', 'Blanchedalmond', 'Bisque', 'Navajowhite', 'Wheat', 'Burlywood', 'Tan', 'Rosybrown', 'Sandybrown', 'Goldenrod', 'Darkgoldenrod', 'Peru', 'Chocolate', 'Saddlebrown', 'Sienna', 'Brown', 'Maroon', 'Snow', 'Honeydew', 'Mintcream', 'Azure', 'Aliceblue', 'Ghostwhite', 'Whitesmoke', 'Seashell', 'Beige', 'Oldlace', 'Floralwhite', 'Ivory', 'Antiquewhite', 'Linen', 'Lavenderblush', 'Mistyrose', 'Gainsboro', 'Lightgray', 'Silver', 'Darkgray', 'Gray', 'Dimgray', 'Lightslategray', 'Slategray', 'Darkslategray', 'Black']
    color_name = color_name_list[random.randint(0, len(color_name_list)-1)]
    raw_curr_date = datetime.datetime.now()
    str_curr_date = raw_curr_date.strftime('%Y-%m-%d %H:%M:%S')

    new_record = models()
    new_record['id'] = str(uuid.uuid4())
    new_record['category'] = dicted_file['category']
    new_record['createdAt'] = str_curr_date
    new_record['updatedAt'] = str_curr_date
    new_record['eyeCatchURL'] = color_name
    new_record['fileName'] = file_name
    new_record['tag'] = dicted_file['tag']
    new_record['title'] = dicted_file['title']

    # fileName でクエリした結果 1 件以上だった場合、そのレコードの値を一部に適用する
    if records_count >= 1:
        old_record = dynamodb_response['Items'][0]
        new_record['id'] = old_record['id']['S']
        new_record['createdAt'] = old_record['createdAt']['S']
        new_record['eyeCatchURL'] = old_record['eyeCatchURL']['S']

    # # DynamoDB にメタデータを書き込んでいく
    dynamodb = boto3.resource('dynamodb')

    try:
        table = dynamodb.Table('sublog')
        logger.info('## upsert')
        logger.info(new_record)
        with table.batch_writer() as batch:
            batch.put_item(
                Item={
                    'id': new_record['id'],
                    'category': new_record['category'],
                    'createdAt': new_record['createdAt'],
                    'updatedAt': new_record['updatedAt'],
                    'eyeCatchURL': new_record['eyeCatchURL'],
                    'fileName': new_record['fileName'],
                    'media': new_record['media'],
                    'tag': new_record['tag'],
                    'title': new_record['title']
                }
            )
    except Exception as e:
        logger.exception('## Exception')
        logger.exception(e)
        notification_content = create_notification_content(
            __file__, '## Exception')
        post_notification(url, notification_content, logger)
        raise
    notification_content = create_notification_content(
        __file__, '以下の内容で記事メタデータを作成しました\r title: %s \r fileName: %s' % (new_record['title'], new_record['fileName']))
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
