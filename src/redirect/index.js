exports.handler = async (event, context, callback) => {
    const request = event.Records[0].cf.request
    request.uri =
        request.uri.match(/^\/article\/*/) | request.uri.match(/^\/category\/*/)
            ? request.uri + '.html'
            : request.uri
    console.log(request.uri)
    callback(null, request)
}
