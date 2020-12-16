
from models import models
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
        raise
    return True
