import json
import boto3
import uuid
import os
from botocore.config import Config

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

BUCKET_NAME = os.environ["BUCKET_NAME"]


def response(status, body):
    return {
        "statusCode": status,
        "headers": {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "*",
            "Access-Control-Allow-Methods": "*",
            "Content-Type": "application/json"
        },
        "body": json.dumps(body)
    }


def lambda_handler(event, context):

    image_name = f"uploads/{uuid.uuid4()}.jpg"

    upload_url = s3.generate_presigned_url(
        ClientMethod="put_object",
        Params={
            "Bucket": BUCKET_NAME,
            "Key": image_name,
            "ContentType": "image/jpeg"
        },
        ExpiresIn=300
    )

    return response(
        200,
        {
            "uploadUrl": upload_url,
            "objectKey": image_name
        }
    )