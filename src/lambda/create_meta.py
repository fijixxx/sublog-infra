import boto3
import ast


def lambda_handler(event, context):
    s3_client = boto3.client('s3')

    secrets_client = boto3.client('secretsmanager')
    raw_secret = secrets_client.get_secret_value(
        SecretId='sublog_assets_bucket_name',
    )['SecretString']
    secret = ast.literal_eval(raw_secret)
    bucket_name = secret['name']

    s3_response = s3_client.list_objects_v2(
        Bucket=bucket_name,
    )
    contents = s3_response['Contents']
    meta_lists = []
    for content in contents:
        meta_file_name = content['Key']
        meta_lists.append(meta_file_name[0:-5])

    dynamodb = boto3.client('dynamodb')
    dynamodb_response = dynamodb.query(
        TableName='sublog',
        IndexName='media-createdAt-index',
        KeyConditionExpression='media = :media',
        ExpressionAttributeValues={':media': {'S': 'sublog'}}
    )

    records = dynamodb_response['Items']
    records_meta_lists = []
    for record in records:
        record_file_name_column = record['fileName']
        record_file_name = record_file_name_column['S']
        records_meta_lists.append(record_file_name)

    # FIXME このやり方だと、リポジトリには存在しないがDBには存在する（つまり削除したい）データの削除はできない（どころか、DBに重複してしまう。。。）
    meta_lists.extend(records_meta_lists)
    unique_list = [unique for unique in set(
        meta_lists) if meta_lists.count(unique) == 1]
