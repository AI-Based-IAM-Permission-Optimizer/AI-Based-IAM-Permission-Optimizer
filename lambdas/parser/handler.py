import gzip
import json
import boto3

from parser import parse_cloudtrail_event


s3 = boto3.client("s3")


def lambda_handler(event, context):
    processed_events = []

    for record in event.get("Records", []):
        bucket = record["s3"]["bucket"]["name"]
        key = record["s3"]["object"]["key"]

        response = s3.get_object(
            Bucket=bucket,
            Key=key
        )

        compressed_data = response["Body"].read()
        log_data = gzip.decompress(compressed_data)
        cloudtrail_data = json.loads(log_data)

        for cloudtrail_event in cloudtrail_data.get("Records", []):
            parsed_event = parse_cloudtrail_event(cloudtrail_event)
            processed_events.append(parsed_event)

    return {
        "statusCode": 200,
        "body": json.dumps(processed_events)
    }