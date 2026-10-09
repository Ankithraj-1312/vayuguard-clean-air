# VayuGuard — Technical Implementation Plan

---

## Project Directory Structure

```
vayuguard/
├── backend/
│   ├── lambdas/
│   │   ├── ingest/
│   │   │   ├── index.py            # Fetches AQI from WAQI/OpenAQ, writes to DynamoDB
│   │   │   └── requirements.txt
│   │   ├── forecast/
│   │   │   ├── index.py            # Short-horizon AQI prediction model
│   │   │   └── requirements.txt
│   │   ├── evaluator/
│   │   │   ├── index.py            # Checks forecast vs. school schedule thresholds
│   │   │   └── requirements.txt
│   │   ├── bedrock_advisor/
│   │   │   ├── index.py            # Calls Amazon Bedrock, gets optimized schedule JSON
│   │   │   └── requirements.txt
│   │   └── dispatcher/
│   │       ├── index.py            # Sends SNS SMS + Telegram/webhook notifications
│   │       └── requirements.txt
│   ├── step_functions/
│   │   └── state_machine.json      # AWS Step Functions ASL definition
│   ├── dynamodb/
│   │   └── schema.md               # Table design documentation
│   └── scripts/
│       ├── seed_schedule.py        # Loads sample school timetable into DynamoDB
│       └── test_pipeline.py        # End-to-end local test runner
├── frontend/
│   ├── public/
│   │   └── index.html
│   ├── src/
│   │   ├── App.jsx
│   │   ├── components/
│   │   │   ├── AQIBadge.jsx        # Live color-coded AQI display
│   │   │   ├── ForecastChart.jsx   # 6-hour line chart
│   │   │   ├── DualTimeline.jsx    # Original vs Optimized schedule side-by-side
│   │   │   ├── SimulatorSlider.jsx # What-if AQI spike slider
│   │   │   ├── KPICounter.jsx      # Avoided exposure hours counter
│   │   │   └── CircularModal.jsx   # Bilingual parent notice modal
│   │   ├── api/
│   │   │   └── client.js           # Axios calls to API Gateway
│   │   └── index.css
│   ├── package.json
│   └── amplify.yml
├── WHAT_IS_THIS.md                 # Simple English project explainer
├── PLAN.md                         # Hackathon strategy & architecture
├── IMPLEMENTATION.md               # This file
└── README.md                       # Hackathon submission document
```

---

## Tech Stack

| Layer | Technology | Why |
| :--- | :--- | :--- |
| **Runtime (Backend)** | Python 3.12 (AWS Lambda) | Team familiarity; boto3 SDK is mature |
| **AI / LLM** | Amazon Bedrock (Claude 3.5 Sonnet) | Structured JSON output, low latency, no API key management |
| **Database** | Amazon DynamoDB (On-Demand) | Serverless, zero cold-start latency, single-table design |
| **Orchestration** | AWS Step Functions (Express) | Visual state machine; atomic error handling per step |
| **Scheduling** | Amazon EventBridge (cron) | Triggers Step Functions every 15 minutes |
| **Notifications** | Amazon SNS + Telegram Bot API | Dual delivery: SMS via SNS + instant Telegram |
| **Frontend** | React 18 + Recharts + Vite | Fast, component-based; Recharts for the forecast line |
| **Hosting** | AWS Amplify | One-command deploy from GitHub |
| **API Layer** | Amazon API Gateway (HTTP API) + Lambda | Cheap, fast, no server |
| **Monitoring** | Amazon CloudWatch | Lambda logs, error alarms |
| **IaC** | AWS SAM (`template.yaml`) | Reproducible infra deploy in one command |
| **AQI Data** | WAQI API (primary), OpenAQ (fallback) | WAQI free tier covers India; OpenAQ is open and reliable |

---

## DynamoDB — Single Table Design

**Table Name:** `vayuguard`  
**Billing:** On-Demand (PAY_PER_REQUEST)

### Access Patterns & Key Design

| Entity | PK | SK | Attributes |
| :--- | :--- | :--- | :--- |
| AQI Reading | `STATION#<station_id>` | `READING#<ISO_timestamp>` | `aqi`, `pm25`, `pm10`, `source`, `ttl` |
| Last Known Good Cache | `CACHE#LKG` | `STATION#<station_id>` | `aqi`, `updated_at` |
| School Timetable | `SCHOOL#<school_id>` | `SCHEDULE#DEFAULT` | `periods` (list of period objects) |
| Optimized Schedule | `SCHOOL#<school_id>` | `SCHEDULE#<date>` | `original`, `optimized`, `bedrock_advisory_en`, `bedrock_advisory_hi`, `students_protected` |
| Subscribers | `SUBSCRIBER#<id>` | `SCHOOL#<school_id>` | `phone`, `telegram_chat_id`, `role` (admin/teacher/parent), `lang` |

**TTL:** AQI readings expire after 7 days automatically (set `ttl` attribute to `now + 7 days` in epoch).

---

## Lambda 1 — `ingest/index.py`

**Trigger:** AWS Step Functions (called as first state)  
**Job:** Fetch live AQI from WAQI API, write to DynamoDB, update LKG cache

```python
import boto3, requests, os, time
from datetime import datetime, timezone

dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table(os.environ['TABLE_NAME'])

STATION_ID = os.environ.get('WAQI_STATION', '@7016')  # Delhi, Anand Vihar
WAQI_TOKEN = os.environ['WAQI_TOKEN']

def handler(event, context):
    url = f"https://api.waqi.info/feed/{STATION_ID}/?token={WAQI_TOKEN}"
    
    try:
        resp = requests.get(url, timeout=8)
        data = resp.json()
        
        if data['status'] != 'ok':
            raise ValueError("Bad status from WAQI")
        
        aqi = data['data']['aqi']
        pm25 = data['data'].get('iaqi', {}).get('pm25', {}).get('v', None)
        ts = datetime.now(timezone.utc).isoformat()
        
        # Write time-series reading
        table.put_item(Item={
            'PK': f'STATION#{STATION_ID}',
            'SK': f'READING#{ts}',
            'aqi': aqi,
            'pm25': pm25,
            'source': 'WAQI',
            'ttl': int(time.time()) + 7 * 24 * 3600
        })
        
        # Update Last Known Good cache
        table.put_item(Item={
            'PK': 'CACHE#LKG',
            'SK': f'STATION#{STATION_ID}',
            'aqi': aqi,
            'updated_at': ts
        })
        
        return {'status': 'ok', 'aqi': aqi, 'timestamp': ts, 'from_cache': False}
    
    except Exception as e:
        # Fallback: read Last Known Good
        resp = table.get_item(Key={'PK': 'CACHE#LKG', 'SK': f'STATION#{STATION_ID}'})
        item = resp.get('Item')
        if item:
            return {
                'status': 'ok',
                'aqi': item['aqi'],
                'timestamp': item['updated_at'],
                'from_cache': True,
                'stale_reason': str(e)
            }
        raise RuntimeError("No live data and no cache available") from e
```

---

## Lambda 2 — `forecast/index.py`

**Job:** Pull the last 8 readings from DynamoDB, run exponential smoothing, return 6-hour forecast

```python
import boto3, os
from boto3.dynamodb.conditions import Key
from datetime import datetime, timezone, timedelta
from decimal import Decimal

dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table(os.environ['TABLE_NAME'])

STATION_ID = os.environ.get('WAQI_STATION', '@7016')
ALPHA = 0.3  # Exponential smoothing factor

def handler(event, context):
    # Fetch last 8 readings
    now = datetime.now(timezone.utc)
    since = (now - timedelta(hours=4)).isoformat()

    result = table.query(
        KeyConditionExpression=Key('PK').eq(f'STATION#{STATION_ID}') &
                                Key('SK').between(f'READING#{since}', f'READING#{now.isoformat()}'),
        ScanIndexForward=False,
        Limit=8
    )

    readings = [int(item['aqi']) for item in result.get('Items', [])]
    
    if not readings:
        # Use ingestion output if no history
        current_aqi = int(event.get('aqi', 200))
        readings = [current_aqi]

    # Exponential smoothing forecast
    smoothed = readings[0]
    for r in readings[1:]:
        smoothed = ALPHA * r + (1 - ALPHA) * smoothed

    # Generate hourly forecast for next 6 hours
    # Simple trend: apply diurnal correction for North India smog pattern
    # Peak expected around 10:00–12:00, clears by 15:00
    forecast = []
    for h in range(1, 7):
        future_time = now + timedelta(hours=h)
        hour_of_day = future_time.hour
        
        # Diurnal adjustment: morning inversion adds 15% per hour up to noon, then -10% per hour
        if 7 <= hour_of_day <= 12:
            adjustment = 1 + (0.08 * (12 - abs(hour_of_day - 10)))
        elif 12 < hour_of_day <= 17:
            adjustment = 1 - (0.07 * (hour_of_day - 12))
        else:
            adjustment = 1.0
        
        predicted_aqi = int(min(500, max(0, smoothed * adjustment)))
        forecast.append({
            'time': future_time.strftime('%H:%M'),
            'aqi': predicted_aqi,
            'status': classify_aqi(predicted_aqi)
        })

    return {
        'station_id': STATION_ID,
        'current_aqi': int(smoothed),
        'from_cache': event.get('from_cache', False),
        'forecast': forecast
    }

def classify_aqi(aqi):
    if aqi <= 50:   return 'Good'
    if aqi <= 100:  return 'Satisfactory'
    if aqi <= 200:  return 'Moderate'
    if aqi <= 300:  return 'Poor'
    if aqi <= 400:  return 'Very Poor'
    return 'Severe'
```

---

## Lambda 3 — `evaluator/index.py`

**Job:** Cross-check forecast against school timetable; flag dangerous overlaps

```python
import boto3, os
from boto3.dynamodb.conditions import Key
from datetime import date

dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table(os.environ['TABLE_NAME'])

SCHOOL_ID = os.environ.get('SCHOOL_ID', 'DELHI_MODEL_ACADEMY')
HAZARD_AQI_THRESHOLD = 300  # "Very Poor" threshold for outdoor activity

def handler(event, context):
    forecast = event['forecast']  # List of {time, aqi, status}
    
    # Load school default schedule
    resp = table.get_item(Key={'PK': f'SCHOOL#{SCHOOL_ID}', 'SK': 'SCHEDULE#DEFAULT'})
    schedule = resp.get('Item', {}).get('periods', get_default_schedule())
    
    # Find dangerous overlaps
    dangerous_periods = []
    safe_windows = []
    
    for period in schedule:
        if period.get('location_type') != 'outdoor':
            continue
        
        period_hour = int(period['time'].split(':')[0])
        
        # Check forecast for that hour
        for slot in forecast:
            slot_hour = int(slot['time'].split(':')[0])
            if abs(slot_hour - period_hour) <= 1:  # Within 1 hour window
                if slot['aqi'] >= HAZARD_AQI_THRESHOLD:
                    dangerous_periods.append({**period, 'forecast_aqi': slot['aqi']})
                elif slot['aqi'] < 250:
                    safe_windows.append({'time': slot['time'], 'aqi': slot['aqi']})

    hazard_detected = len(dangerous_periods) > 0
    
    return {
        **event,
        'school_id': SCHOOL_ID,
        'original_schedule': schedule,
        'hazard_detected': hazard_detected,
        'dangerous_periods': dangerous_periods,
        'safe_windows': safe_windows
    }

def get_default_schedule():
    return [
        {'period': 1, 'name': 'Morning Assembly', 'time': '08:30', 'duration_mins': 20, 'location_type': 'outdoor', 'location': 'School Ground'},
        {'period': 3, 'name': 'Primary Recess',   'time': '11:00', 'duration_mins': 30, 'location_type': 'outdoor', 'location': 'Playground'},
        {'period': 5, 'name': 'Sports / PE',      'time': '13:30', 'duration_mins': 45, 'location_type': 'outdoor', 'location': 'Sports Ground'},
        {'period': 6, 'name': 'Library Period',   'time': '14:30', 'duration_mins': 45, 'location_type': 'indoor',  'location': 'Library'},
    ]
```

---

## Lambda 4 — `bedrock_advisor/index.py`

**Job:** Call Bedrock with structured input, receive optimized schedule JSON

```python
import boto3, json, os

bedrock = boto3.client('bedrock-runtime', region_name='us-east-1')

SYSTEM_PROMPT = """You are VayuGuard AI — an expert school health safety officer and timetable optimizer.
Your goal is to protect children from PM2.5 exposure by rescheduling outdoor activities to lower-AQI windows.
Rules:
1. Never cancel activities — only move or swap them with indoor alternatives.
2. Return a valid JSON object matching the output_contract schema exactly.
3. Generate advisory_en and advisory_hi in a friendly, reassuring tone (not alarming).
4. Calculate students_protected as total students * (outdoor_periods_rescheduled / total_outdoor_periods).
5. exposure_hours_saved = sum of (duration_mins/60) for each rescheduled outdoor period."""

def handler(event, context):
    if not event.get('hazard_detected'):
        return {**event, 'optimized_schedule': event['original_schedule'], 
                'bedrock_used': False,
                'advisory_en': 'Air quality is acceptable. No schedule changes needed today.',
                'advisory_hi': 'आज वायु गुणवत्ता स्वीकार्य है। कोई कार्यक्रम परिवर्तन आवश्यक नहीं है।',
                'students_protected': 0, 'exposure_hours_saved': 0}

    payload = {
        'input': {
            'school_id': event['school_id'],
            'forecast': event['forecast'],
            'original_schedule': event['original_schedule'],
            'dangerous_periods': event['dangerous_periods'],
            'safe_windows': event['safe_windows'],
            'total_students': 450
        },
        'output_contract': {
            'optimized_schedule': 'array of period objects with updated time, location, reason fields',
            'advisory_en': 'string - parent-facing notice in English',
            'advisory_hi': 'string - same notice in Hindi',
            'students_protected': 'integer',
            'exposure_hours_saved': 'float'
        }
    }

    body = {
        'anthropic_version': 'bedrock-2023-05-31',
        'max_tokens': 1024,
        'system': SYSTEM_PROMPT,
        'messages': [
            {
                'role': 'user',
                'content': f'Optimize this school schedule. Return ONLY valid JSON.\n\n{json.dumps(payload, indent=2)}'
            }
        ]
    }

    response = bedrock.invoke_model(
        modelId='anthropic.claude-3-5-sonnet-20241022-v2:0',
        body=json.dumps(body),
        contentType='application/json',
        accept='application/json'
    )
    
    result = json.loads(response['body'].read())
    text = result['content'][0]['text']
    
    # Parse JSON from Bedrock response
    start = text.find('{')
    end = text.rfind('}') + 1
    advisor_data = json.loads(text[start:end])

    return {**event, **advisor_data, 'bedrock_used': True}
```

---

## Lambda 5 — `dispatcher/index.py`

**Job:** Send SMS via SNS and message via Telegram bot

```python
import boto3, requests, os, json

sns = boto3.client('sns')
dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table(os.environ['TABLE_NAME'])

TELEGRAM_TOKEN = os.environ.get('TELEGRAM_BOT_TOKEN', '')

def handler(event, context):
    if not event.get('hazard_detected'):
        return {'dispatched': False, 'reason': 'No hazard, no alert needed'}

    school_id = event['school_id']
    advisory_en = event['advisory_en']
    advisory_hi = event['advisory_hi']
    students_protected = event.get('students_protected', 0)
    exposure_saved = event.get('exposure_hours_saved', 0)

    full_message = (
        f"[VayuGuard Alert] {advisory_en}\n\n"
        f"{advisory_hi}\n\n"
        f"Students protected today: {students_protected} | "
        f"Exposure hours saved: {exposure_saved:.1f}h"
    )

    # Fetch subscribers for this school
    from boto3.dynamodb.conditions import Key
    resp = table.query(
        IndexName='SK-PK-index',
        KeyConditionExpression=Key('SK').eq(f'SCHOOL#{school_id}')
    )
    subscribers = resp.get('Items', get_test_subscribers())

    dispatched = 0
    for sub in subscribers:
        # SMS via SNS
        if sub.get('phone'):
            try:
                sns.publish(
                    PhoneNumber=sub['phone'],
                    Message=full_message[:160],  # SMS character limit
                    MessageAttributes={'AWS.SNS.SMS.SMSType': {'DataType': 'String', 'StringValue': 'Transactional'}}
                )
                dispatched += 1
            except Exception as e:
                print(f"SNS failed for {sub.get('phone')}: {e}")

        # Telegram
        if sub.get('telegram_chat_id') and TELEGRAM_TOKEN:
            try:
                requests.post(
                    f'https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendMessage',
                    json={'chat_id': sub['telegram_chat_id'], 'text': full_message, 'parse_mode': 'Markdown'},
                    timeout=5
                )
                dispatched += 1
            except Exception as e:
                print(f"Telegram failed: {e}")

    return {**event, 'dispatched': True, 'alerts_sent': dispatched}

def get_test_subscribers():
    # Hardcoded test subscribers for demo — replace with real data
    return [
        {'phone': '+91XXXXXXXXXX', 'telegram_chat_id': 'YOUR_CHAT_ID', 'role': 'admin'}
    ]
```

---

## AWS Step Functions State Machine — `state_machine.json`

```json
{
  "Comment": "VayuGuard AQI Pipeline",
  "StartAt": "Ingest",
  "States": {
    "Ingest": {
      "Type": "Task",
      "Resource": "arn:aws:lambda:REGION:ACCOUNT_ID:function:vayuguard-ingest",
      "Next": "Forecast",
      "Catch": [{"ErrorEquals": ["States.ALL"], "Next": "PipelineFailed"}]
    },
    "Forecast": {
      "Type": "Task",
      "Resource": "arn:aws:lambda:REGION:ACCOUNT_ID:function:vayuguard-forecast",
      "Next": "Evaluate",
      "Catch": [{"ErrorEquals": ["States.ALL"], "Next": "PipelineFailed"}]
    },
    "Evaluate": {
      "Type": "Task",
      "Resource": "arn:aws:lambda:REGION:ACCOUNT_ID:function:vayuguard-evaluator",
      "Next": "BedrockAdvisor",
      "Catch": [{"ErrorEquals": ["States.ALL"], "Next": "PipelineFailed"}]
    },
    "BedrockAdvisor": {
      "Type": "Task",
      "Resource": "arn:aws:lambda:REGION:ACCOUNT_ID:function:vayuguard-bedrock-advisor",
      "Next": "Dispatch",
      "Catch": [{"ErrorEquals": ["States.ALL"], "Next": "PipelineFailed"}]
    },
    "Dispatch": {
      "Type": "Task",
      "Resource": "arn:aws:lambda:REGION:ACCOUNT_ID:function:vayuguard-dispatcher",
      "Next": "PipelineSuccess",
      "Catch": [{"ErrorEquals": ["States.ALL"], "Next": "PipelineFailed"}]
    },
    "PipelineSuccess": {
      "Type": "Succeed"
    },
    "PipelineFailed": {
      "Type": "Fail",
      "Error": "VayuGuardPipelineError",
      "Cause": "One or more pipeline stages failed"
    }
  }
}
```

---

## Frontend — Key Components

### `DualTimeline.jsx` (Core Visual)
```jsx
import React from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';

export function DualTimeline({ original, optimized, forecast }) {
  return (
    <div className="dual-timeline">
      <h2>Schedule Comparison</h2>

      {/* AQI Forecast Overlay */}
      <ResponsiveContainer width="100%" height={120}>
        <AreaChart data={forecast}>
          <XAxis dataKey="time" />
          <YAxis domain={[0, 500]} />
          <Tooltip />
          <Area type="monotone" dataKey="aqi" stroke="#ff6b35" fill="#ff6b3533" />
          <ReferenceLine y={300} stroke="red" strokeDasharray="4 4" label="Hazard" />
        </AreaChart>
      </ResponsiveContainer>

      {/* Schedule Rows */}
      <div className="timeline-rows">
        <TimelineRow label="Original" periods={original} color="#6b7280" />
        <TimelineRow label="Optimized" periods={optimized} color="#22c55e" />
      </div>
    </div>
  );
}

function TimelineRow({ label, periods, color }) {
  return (
    <div className="timeline-row">
      <span className="row-label">{label}</span>
      <div className="periods">
        {periods.map((p, i) => (
          <div key={i}
            className="period-block"
            style={{ backgroundColor: p.location_type === 'outdoor' ? '#ef444422' : '#22c55e22',
                     borderLeft: `3px solid ${p.location_type === 'outdoor' ? '#ef4444' : '#22c55e'}` }}>
            <span className="period-time">{p.time}</span>
            <span className="period-name">{p.name}</span>
            <span className="period-location">{p.location}</span>
            {p.reason && <span className="period-reason">{p.reason}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
```

### `SimulatorSlider.jsx`
```jsx
import React, { useState } from 'react';

export function SimulatorSlider({ onSimulate }) {
  const [spikeAmount, setSpikeAmount] = useState(0);

  return (
    <div className="simulator">
      <h3>What-If Simulator</h3>
      <p>Drag to simulate a smog spike: +{spikeAmount} AQI</p>
      <input
        type="range" min={0} max={300} step={10}
        value={spikeAmount}
        onChange={(e) => setSpikeAmount(Number(e.target.value))}
        onMouseUp={() => onSimulate(spikeAmount)}
      />
      <div className="spike-labels">
        <span>No Spike</span>
        <span>+300 (Extreme)</span>
      </div>
    </div>
  );
}
```

---

## Environment Variables Required

Create a `.env` file locally (never commit this):

```bash
# DynamoDB
TABLE_NAME=vayuguard

# AQI Data
WAQI_TOKEN=your_waqi_api_token_here
WAQI_STATION=@7016

# School Config
SCHOOL_ID=DELHI_MODEL_ACADEMY

# Notifications
TELEGRAM_BOT_TOKEN=your_telegram_bot_token_here
SNS_TOPIC_ARN=arn:aws:sns:us-east-1:ACCOUNT:vayuguard-alerts

# AWS Region
AWS_REGION=us-east-1
```

---

## AWS SAM Template Skeleton — `template.yaml`

```yaml
AWSTemplateFormatVersion: '2010-09-09'
Transform: AWS::Serverless-2016-10-31
Description: VayuGuard - AQI School Safety Platform

Globals:
  Function:
    Runtime: python3.12
    Timeout: 30
    Environment:
      Variables:
        TABLE_NAME: !Ref VayuGuardTable

Resources:

  VayuGuardTable:
    Type: AWS::DynamoDB::Table
    Properties:
      TableName: vayuguard
      BillingMode: PAY_PER_REQUEST
      AttributeDefinitions:
        - {AttributeName: PK, AttributeType: S}
        - {AttributeName: SK, AttributeType: S}
      KeySchema:
        - {AttributeName: PK, KeyType: HASH}
        - {AttributeName: SK, KeyType: RANGE}
      TimeToLiveSpecification:
        AttributeName: ttl
        Enabled: true

  IngestFunction:
    Type: AWS::Serverless::Function
    Properties:
      FunctionName: vayuguard-ingest
      CodeUri: backend/lambdas/ingest/
      Handler: index.handler
      Policies:
        - DynamoDBCrudPolicy: {TableName: !Ref VayuGuardTable}

  ForecastFunction:
    Type: AWS::Serverless::Function
    Properties:
      FunctionName: vayuguard-forecast
      CodeUri: backend/lambdas/forecast/
      Handler: index.handler
      Policies:
        - DynamoDBReadPolicy: {TableName: !Ref VayuGuardTable}

  EvaluatorFunction:
    Type: AWS::Serverless::Function
    Properties:
      FunctionName: vayuguard-evaluator
      CodeUri: backend/lambdas/evaluator/
      Handler: index.handler
      Policies:
        - DynamoDBReadPolicy: {TableName: !Ref VayuGuardTable}

  BedrockAdvisorFunction:
    Type: AWS::Serverless::Function
    Properties:
      FunctionName: vayuguard-bedrock-advisor
      CodeUri: backend/lambdas/bedrock_advisor/
      Handler: index.handler
      Policies:
        - DynamoDBCrudPolicy: {TableName: !Ref VayuGuardTable}
        - Statement:
            - Effect: Allow
              Action: bedrock:InvokeModel
              Resource: "arn:aws:bedrock:us-east-1::foundation-model/anthropic.claude-3-5-sonnet-20241022-v2:0"

  DispatcherFunction:
    Type: AWS::Serverless::Function
    Properties:
      FunctionName: vayuguard-dispatcher
      CodeUri: backend/lambdas/dispatcher/
      Handler: index.handler
      Policies:
        - DynamoDBReadPolicy: {TableName: !Ref VayuGuardTable}
        - SNSPublishMessagePolicy: {TopicName: vayuguard-alerts}

  PipelineTrigger:
    Type: AWS::Events::Rule
    Properties:
      ScheduleExpression: rate(15 minutes)
      State: ENABLED
      Targets:
        - Arn: !GetAtt VayuGuardStateMachine.Arn
          Id: VayuGuardTrigger
          RoleArn: !GetAtt EventBridgeRole.Arn
```

---

## Step-by-Step Setup Instructions (Start Here)

### Day 1 — Backend (Hours 0–16)

**Hour 0–1: AWS Setup**
```bash
# 1. Install AWS CLI and SAM CLI if not done
# https://aws.amazon.com/cli/  |  https://aws.amazon.com/serverless/sam/

# 2. Configure AWS credentials
aws configure

# 3. Enable Bedrock model access
# AWS Console > Amazon Bedrock > Model Access > Request Claude 3.5 Sonnet
# NOTE: This can take 10-30 minutes. Do this FIRST.
```

**Hour 1–2: Get AQI Token**
```bash
# Register for free WAQI API key at:
# https://aqicn.org/api/
# Test it:
curl "https://api.waqi.info/feed/@7016/?token=YOUR_TOKEN"
# Should return JSON with Delhi AQI data
```

**Hour 2–6: Build & Deploy Lambdas**
```bash
# Clone / init project
mkdir vayuguard && cd vayuguard

# Build and deploy with SAM
sam build
sam deploy --guided  # Follow prompts, use us-east-1 or ap-south-1

# Test ingest lambda directly
aws lambda invoke --function-name vayuguard-ingest output.json
cat output.json
```

**Hour 6–12: Step Functions + Forecast**
```bash
# After deploying lambdas, create Step Functions state machine
# AWS Console > Step Functions > Create State Machine
# Copy-paste the state_machine.json from above
# Replace REGION and ACCOUNT_ID with your values

# Manual test trigger
aws stepfunctions start-execution \
  --state-machine-arn arn:aws:states:REGION:ACCOUNT:stateMachine:VayuGuard \
  --input '{}'
```

**Hour 12–16: Bedrock Integration**
```bash
# Test Bedrock call
python3 backend/lambdas/bedrock_advisor/index.py

# Check CloudWatch logs if anything breaks
aws logs tail /aws/lambda/vayuguard-bedrock-advisor --follow
```

---

### Day 2 — Frontend + Polish (Hours 16–30)

**Hour 16–22: React Frontend**
```bash
cd frontend
npx create-vite@latest . -- --template react
npm install recharts axios

# Start dev server
npm run dev
```

**Hour 22–25: Amplify Deploy**
```bash
# Install Amplify CLI
npm install -g @aws-amplify/cli

# Initialize Amplify in frontend folder
amplify init
amplify add hosting
amplify publish

# Copy the Amplify URL — this is your demo dashboard URL
```

**Hour 25–27: End-to-End Tests**
```bash
# Run twice with no manual intervention
python3 backend/scripts/test_pipeline.py

# Verify:
# 1. DynamoDB has new readings
# 2. Bedrock returned an optimized schedule
# 3. Test phone/Telegram received notification
# 4. Dashboard reflects live data
```

**Hour 27–30: Demo Video + Submission**
- Record screen using OBS or Loom
- Follow the 180-second storyboard from PLAN.md Section 7
- Upload to YouTube (Public or Unlisted)
- Test video link in Incognito browser
- Submit on the hackathon platform

---

## Pre-Submission Checklist

- [ ] GitHub repo has commits with dates within Oct 8–11, 2026 only
- [ ] AWS Bedrock endpoint returns school-specific optimized schedule JSON
- [ ] Test phone or browser receives notification when threshold is crossed
- [ ] Dashboard never shows a blank/undefined/error state
- [ ] "Stale data" badge appears when API is killed (test this live in the video)
- [ ] Demo video is under 3:00 minutes
- [ ] Demo video opens correctly in Incognito browser without login
- [ ] `README.md` lists all AI tools used (per hackathon rules)
- [ ] `README.md` explains which AWS services are used and WHY
- [ ] Submission form at WeMakeDevs filled out completely

---

*Questions? Check `WHAT_IS_THIS.md` for plain-English context or `PLAN.md` for strategy.*
