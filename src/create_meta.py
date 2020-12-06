import ast
import uuid
import datetime
import random

import boto3
import toml


def lambda_handler(event, context):
    """メタデータ.toml が対象 S3 にアップロードされるたびに EventNotifications でキックされ、
    メタデータ.toml のファイル名と DynamoDB レコードの fileName 項目を突合した結果に応じて、
    DynamoDB レコードに対して CRUD 処理を行う関数
    """

    # SecretsManager から、メタデータ.toml ファイルを格納する S3 バケット名を取得
    secrets_client = boto3.client('secretsmanager')
    raw_secret = secrets_client.get_secret_value(
        SecretId='sublog_assets_bucket_name',
    )['SecretString']
    # Key 指定で value を取得できないので注意(おそらく SecretsManager 特有)
    # FYI: https://dev.classmethod.jp/articles/secrets_manager_tips_get_api_key/
    secret = ast.literal_eval(raw_secret)
    bucket_name = secret['name']

    # S3 バケット内の オブジェクト一覧 取得結果から、 オブジェクト名一覧リスト を作成
    s3_client = boto3.client('s3')
    s3_response = s3_client.list_objects_v2(
        Bucket=bucket_name,
    )
    contents = s3_response['Contents']
    meta_file_list = []
    for content in contents:
        meta_file_name = content['Key']
        # .toml 部分（後ろから5文字）を除いて追加
        meta_file_list.append(meta_file_name[0:-5])

    # DynamoDB に、ブログ用レコード（media = 'sublog'）をクエリして結果を取得
    dynamodb_client = boto3.client('dynamodb')
    dynamodb_response = dynamodb_client.query(
        TableName='sublog',
        IndexName='media-createdAt-index',
        KeyConditionExpression='media = :media',
        ExpressionAttributeValues={':media': {'S': 'sublog'}}
    )

    # DynamoDB クエリ結果から、 fileName 一覧リストを作成
    records = dynamodb_response['Items']
    meta_record_list = []
    for record in records:
        record_file_name_column = record['fileName']
        record_file_name = record_file_name_column['S']
        meta_record_list.append(record_file_name)

    # S3 の オブジェクト名一覧リスト と、 DynamoDB レコードの fileName 一覧リスト を結合し、
    # "1度も重複しなかったファイル名リスト" を作成する
    meta_joined_list = meta_file_list + meta_record_list
    metas_list = [item for item in set(
        meta_joined_list) if meta_joined_list.count(item) == 1]

    # 1度も重複しなかったファイル名リスト の中身が、S3 の オブジェクト名一覧リスト に含まれていないかチェックする。
    # 含まれていない => DynamoDB にのみ存在しており、ローカル（S3）からは .toml ファイルを削除した => 削除リストへ追加
    # 含まれている => ローカル（S3）にのみ存在している（新規入稿） => 作成リストへ追加
    # FIXME 削除リストの削除処理未実装
    delete_list = []
    create_list = []
    for item in metas_list:
        if not item in meta_file_list:
            delete_list.append(item)
        else:
            create_list.append(item)

    # 作成リスト 内のファイル名をキーにして S3 から実tomlファイルを読み込み、 dict リストを作成する
    create_dict_list = []
    for item in create_list:
        Key = item + '.toml'
        try:
            body = s3_client.get_object(
                Bucket=bucket_name, Key=Key)['Body'].read().decode('utf-8')
            dicted_body = toml.loads(body, _dict=dict)
            create_dict_list.append(dicted_body)
        except Exception as e:
            print(e)

    # dict リストを元に、DynamoDB にメタデータを書き込んでいく
    dynamodb = boto3.resource('dynamodb')

    try:
        table = dynamodb.Table('sublog')
        with table.batch_writer() as batch:
            color_name_list = ['pink', 'tomato', 'orange', 'plum', 'tan']
            for item in create_dict_list:
                raw_curr_date = datetime.datetime.now()
                str_curr_date = raw_curr_date.strftime('%Y-%m-%d %H:%M:%S')
                color_name = color_name_list[random.randint(0, 4)]

                id = str(uuid.uuid4())
                category = item['category']
                # FIXME いまのところ新規登録だけ先につくってしまうので、後でいい感じにする
                createdAt = str_curr_date
                updatedAt = str_curr_date
                eyeCatchURL = color_name
                fileName = item['fileName']
                media = 'sublog'
                tag = item['tag']
                title = item['title']

                batch.put_item(
                    Item={
                        'id': id,
                        'category': category,
                        'createdAt': createdAt,
                        'updatedAt': updatedAt,
                        'eyeCatchURL': eyeCatchURL,
                        'fileName': fileName,
                        'media': media,
                        'tag': tag,
                        'title': title
                    }
                )
    except Exception as e:
        raise e
    return True
