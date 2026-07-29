import urllib.request
import urllib.parse
import json
import re

def search_musicbrainz(query):
    # Clean up the query (remove text in brackets, official video, etc)
    clean_query = re.sub(r'\[.*?\]|\(.*?\)', '', query)
    clean_query = re.sub(r'(?i)official video|lyrics|audio|music video', '', clean_query)
    clean_query = clean_query.strip()
    
    url = f"https://musicbrainz.org/ws/2/recording/?query={urllib.parse.quote(clean_query)}&fmt=json"
    
    req = urllib.request.Request(
        url, 
        headers={'User-Agent': 'StreamOfflinePlayer/1.0 ( my@email.com )'}
    )
    
    try:
        with urllib.request.urlopen(req) as response:
            data = json.loads(response.read().decode('utf-8'))
            if data.get('recordings') and len(data['recordings']) > 0:
                best_match = data['recordings'][0]
                
                title = best_match.get('title')
                artist = best_match.get('artist-credit', [{}])[0].get('name') if best_match.get('artist-credit') else None
                album = None
                if best_match.get('releases') and len(best_match['releases']) > 0:
                    album = best_match['releases'][0].get('title')
                
                return {
                    'title': title,
                    'artist': artist,
                    'album': album
                }
    except Exception as e:
        print(f"Error: {e}")
    
    return None

if __name__ == "__main__":
    test_queries = [
        "Rick Astley - Never Gonna Give You Up (Official Music Video)",
        "Ed Sheeran - Shape of You [Official Video]",
        "Bohemian Rhapsody (Remastered 2011)"
    ]
    for q in test_queries:
        print(f"Original: {q}")
        res = search_musicbrainz(q)
        print(f"Result: {res}\n")
