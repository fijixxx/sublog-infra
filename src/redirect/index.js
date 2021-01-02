exports.handler = async (event, context, callback) => {
  const request = event.Records[0].cf.request;
  console.log("### origin request ###");
  console.log(request);
  request.uri = request.uri.match(/\/article\//)
    ? request.uri + ".html"
    : request.uri;
  callback(null, request);
};
