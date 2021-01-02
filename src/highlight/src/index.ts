import * as AWS from "aws-sdk";
import markdown = require('markdown-it');
import shiki  = require('shiki')
import { TextDecoder } from "util";

type DynamoQueryResponse = {
  Items: [Sublog],
  Count: number,
  ScannedCount: number
}

type Sublog = {
  id: string
  createdAt: string
  fileName: string
  category: string
  media: string
  title: string
  eyeCatchURL: string
  tag: [string]
  updatedAt: string
}

exports.handler = async (event: any) => {
  /**
   * 空メッセージ(空 messegaeId, body)を取得した場合にエラーを吐かないように、
   * for などを使って取得するとよいらしい
   */
  console.log(event)
  for (const { messageId, body } of event.Records) {
    console.log("messageId: " + messageId)
    const parsedSQSBody = JSON.parse(body);
    const id = parsedSQSBody.id
    console.log("articleId: " + id)

    /**
     * event.Records[*].body.id から記事を取得
     */
    AWS.config.update({ region: "ap-northeast-1" });
    const client = new AWS.DynamoDB.DocumentClient();
    const params = {
      TableName: "sublog",
      KeyConditionExpression: "id = :id",
      ExpressionAttributeValues: {
        ":id": id,
      },
    };
    const response = await client
      .query(params)
      .promise()
      .catch((e: any) => e);

    const articles: Sublog[] = dataMapper(response)

    const articleData = articles[0]

    /**
     * 取得した記事から fileName を使って text.md の中身を取得
     */
    const secretsClient = new AWS.SecretsManager()
    const bucketName = await secretsClient.getSecretValue({SecretId: 'sublog_assets_bucket_name'})
      .promise()
      .then((data) => { 
        if (data.SecretString){
          return JSON.parse(data.SecretString).name }
      })
      .catch((e: any)=> e)


    const s3Client = new AWS.S3()
    const targetObject = await s3Client.getObject({
      Bucket: bucketName,
      Key: "text/" + articleData.fileName + '.md'})
      .promise()
      .catch((e: any) => e)
    const decoder = new TextDecoder()
    const decodedBody = decoder.decode(targetObject.Body)

    const highlightClient = (await shiki.getHighlighter({theme: 'nord'}))
    /**
     * codeToHtml にモンキーパッチするか何かが必要
     */
    const md = markdown({html: true, 
                         highlight: (code: any, lang:any) => {return highlightClient.codeToHtml(code, lang)}})
    const parsedHtml = md.render(decodedBody)

    const updateParams = {
            TableName: "sublog",
            Key: {
              id: id,
            },
            UpdateExpression: "set body = :body",
            ExpressionAttributeValues: {
              ":body": parsedHtml,
            },
            ReturnValues: 'ALL_NEW'
    };
    const updateResult = await client
      .update(updateParams)
      .promise()
      .catch((e: any) => e)
    console.log(updateResult)
   }

  return true
}

/**
 * DynamoDB クエリ結果のマッパー
 * @param _response - DynamoDB のクエリレスポンス
 */
const dataMapper = (_response: DynamoQueryResponse):Sublog[] => {
    const data: Sublog[] = _response.Items.map ((item) => ({
      id: item.id || '',
      createdAt:  item.createdAt || '',
      fileName:  item.fileName || '',
      category:  item.category || '',
      media:  item.media || '',
      title:  item.title  || '',
      eyeCatchURL:  item.eyeCatchURL || '',
      tag:  item.tag || [''],
      updatedAt:  item.updatedAt || '',
    }))

    return data
}