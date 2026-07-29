import requests

video_url = "https://www.youtube.com/watch?v=722d3I_hUB4"
api_url = "http://100.123.29.96:8000/api/formats"
# Use this for local testing:
# api_url = "http://127.0.0.1:8000/api/formats"

print(f"Requesting formats for: {video_url}...")
try:
    response = requests.post(api_url, json={"url": video_url})
    if response.status_code == 200:
        data = response.json()
        formats = data.get("formats", [])
        print(f"Found {len(formats)} formats:\n")
        print(f"{'ID':<10} | {'EXT':<6} | {'RESOLUTION':<15} | {'VCODEC':<15} | {'ACODEC':<15} | {'NOTE'}")
        print("-" * 80)
        for f in formats:
            # Handle None values safely
            fmt_id = str(f.get('format_id', ''))
            ext = str(f.get('ext', ''))
            res = str(f.get('resolution', ''))
            vcodec = str(f.get('vcodec', ''))
            acodec = str(f.get('acodec', ''))
            note = str(f.get('format_note', ''))
            print(f"{fmt_id:<10} | {ext:<6} | {res:<15} | {vcodec:<15} | {acodec:<15} | {note}")
    else:
        print(f"Error {response.status_code}: {response.text}")
except Exception as e:
    print(f"Failed to connect: {e}")
