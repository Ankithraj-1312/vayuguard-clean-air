import json
from datetime import datetime, timedelta

def lambda_handler(event, context):
    """
    AWS Lambda: Short-horizon forecast applying North India diurnal atmospheric inversion curve.
    """
    input_body = event if isinstance(event, dict) and 'aqi' in event else event.get('body', {})
    if isinstance(input_body, str):
        input_body = json.loads(input_body)
        
    current_aqi = input_body.get('aqi', 342)
    now = datetime.now()
    
    forecast_points = []
    for i in range(1, 7):
        target_time = now + timedelta(hours=i)
        hour = target_time.hour
        
        # Diurnal factor
        if 7 <= hour <= 11:
            factor = 1.0 + (0.05 * (hour - 7))
        elif 12 <= hour <= 15:
            factor = 0.72 + (0.03 * (15 - hour))
        else:
            factor = 0.90
            
        predicted = int(min(500, max(50, current_aqi * factor)))
        forecast_points.append({
            "hour_offset": i,
            "time": target_time.strftime("%I:%M %p"),
            "predicted_aqi": predicted,
            "status": "Very Poor" if predicted >= 300 else "Poor"
        })
        
    return {
        'statusCode': 200,
        'current_aqi': current_aqi,
        'forecast': forecast_points
    }
