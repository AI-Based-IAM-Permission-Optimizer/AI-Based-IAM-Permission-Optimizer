import json


def parse_cloudtrail_event(event):
    resources = event.get("resources", [])

    event_source = event.get("eventSource", "")
    event_name = event.get("eventName")

    service = event_source.replace(".amazonaws.com", "") if event_source else None

    action = f"{service}:{event_name}" if service and event_name else event_name

    return {
        "user_id": event.get("userIdentity", {}).get("arn"),
        "action": action,
        "resource": resources[0].get("ARN") if resources else None,
        "timestamp": event.get("eventTime"),
        "success": "errorCode" not in event,
    }


if __name__ == "__main__":
    with open("data/sample_event.json", "r") as f:
        event = json.load(f)

    result = parse_cloudtrail_event(event)
    print(json.dumps(result, indent=2))