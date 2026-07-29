import requests
import sys
import time

video_url = "https://www.youtube.com/watch?v=722d3I_hUB4"  # Me at the zoo (very short video)
api_url = "http://100.123.29.96:8000/api/download"

print(f"Requesting download for: {video_url}...")
# Note: we might need to wait for the server to start before pinging
max_retries = 5
for i in range(max_retries):
    try:
        response = requests.post(api_url, json={"url": video_url}, stream=True)
        if response.status_code == 200:
            with open("test.mp3", "wb") as f:
                for chunk in response.iter_content(chunk_size=8192):
                    f.write(chunk)
            print("Downloaded successfully to test.mp3!")
            sys.exit(0)
        else:
            print(f"Error {response.status_code}: {response.text}")
            sys.exit(1)
    except requests.exceptions.ConnectionError:
        print("Server not ready, waiting 2 seconds...")
        time.sleep(2)

print("Failed to connect to the server.")
sys.exit(1)
