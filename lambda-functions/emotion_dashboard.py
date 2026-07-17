import json
import boto3
import os

from boto3.dynamodb.conditions import Key
from botocore.config import Config

dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table("EmotionDetections")

s3 = boto3.client(
    "s3",
    region_name="ap-south-1",
    endpoint_url="https://s3.ap-south-1.amazonaws.com",
    config=Config(
        signature_version="s3v4",
        s3={
            "addressing_style": "virtual"
        }
    )
)

BUCKET = os.environ["BUCKET_NAME"]


def response(status, body):
    return {
        "statusCode": status,
        "headers": {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "*",
            "Access-Control-Allow-Methods": "*",
            "Content-Type": "application/json"
        },
        "body": json.dumps(body, default=str)
    }


def generate_url(item):
    item["imageUrl"] = s3.generate_presigned_url(
        "get_object",
        Params={
            "Bucket": BUCKET,
            "Key": item["objectKey"]
        },
        ExpiresIn=300
    )
    return item


def latest():

    response_db = table.query(
        IndexName="LatestImagesIndex",
        KeyConditionExpression=Key("constantPartition").eq("ALL"),
        ScanIndexForward=False,
        Limit=1
    )

    items = response_db["Items"]

    if not items:
        return response(404, {"message": "No images found"})

    return response(
        200,
        generate_url(items[0])
    )


def recent():

    response_db = table.query(
        IndexName="LatestImagesIndex",
        KeyConditionExpression=Key("constantPartition").eq("ALL"),
        ScanIndexForward=False,
        Limit=10
    )

    items = response_db["Items"]

    return response(
        200,
        [generate_url(item) for item in items]
    )

def get_all_items():
    items = []
    response = table.scan()

    items.extend(response["Items"])

    while "LastEvaluatedKey" in response:
        response = table.scan(
            ExclusiveStartKey=response["LastEvaluatedKey"]
        )
        items.extend(response["Items"])

    return items

def happiest():

    items = get_all_items()

    if not items:
        return response(404, {"message": "No images found"})

    best = max(
        items,
        key=lambda x: float(x["happyConfidence"])
    )

    return response(
        200,
        generate_url(best)
    )


def saddest():

    items = get_all_items()

    if not items:
        return response(404, {"message": "No images found"})

    best = max(
        items,
        key=lambda x: float(x["sadConfidence"])
    )

    return response(
        200,
        generate_url(best)
    )


def lambda_handler(event, context):

    route = event.get("rawPath", "")
    print("Route:", route)

    if route == "/latest":
        return latest()

    if route == "/recent":
        return recent()

    if route == "/happiest":
        return happiest()

    if route == "/saddest":
        return saddest()

    return response(
        404,
        {
            "message": "Invalid endpoint"
        }
    )