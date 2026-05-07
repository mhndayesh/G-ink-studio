import httpx
import time
import sys

BASE_URL = "http://localhost:8001/api/v1"
headers = {"Content-Type": "application/json", "X-Manga-User-Id": "dev_user"}

def test_workflow():
    print("1. Creating story...")
    resp = httpx.post(f"{BASE_URL}/stories", json={"title": "Wiring Test Story"}, headers=headers)
    resp.raise_for_status()
    story_id = resp.json()["data"]["story_id"]
    print(f"   Created Story ID: {story_id}")

    print("2. Saving free writing...")
    text = "Our brave protagonist Kai is brutally attacked and severely injured by a mysterious traitor in the royal guard, forcing him to flee the city."
    resp = httpx.patch(f"{BASE_URL}/stories/{story_id}/plot-workspace/free-writing", json={
        "text": text,
        "input_type": "",
        "user_priority": "",
        "user_intent_notes": "",
        "do_not_change_these_parts": []
    }, headers=headers)
    resp.raise_for_status()
    print("   Free writing saved.")

    print("3. Running analysis...")
    resp = httpx.post(f"{BASE_URL}/stories/{story_id}/plot-workspace/analyze", headers=headers)
    resp.raise_for_status()
    data = resp.json()["data"]
    print(f"   Analysis complete. Questions to answer: {data['questions_created']}")

    print("4. Getting questions...")
    resp = httpx.get(f"{BASE_URL}/stories/{story_id}/plot-workspace/questions", headers=headers)
    resp.raise_for_status()
    questions = resp.json()["data"]["questions"]
    
    print("5. Answering questions...")
    for q in questions:
        q_id = q["question_id"]
        options = q.get("options", ["Yes"])
        selected = options[0] if options else "Yes"
        print(f"   Answering '{q_id}' with '{selected}'...")
        resp = httpx.post(f"{BASE_URL}/stories/{story_id}/plot-workspace/questions/{q_id}/answer", json={
            "selected": selected,
            "custom_answer": ""
        }, headers=headers)
        resp.raise_for_status()

    print("6. Getting confirmation state...")
    resp = httpx.get(f"{BASE_URL}/stories/{story_id}/plot-workspace/confirmation", headers=headers)
    resp.raise_for_status()
    conf_data = resp.json()["data"]
    print(f"   Confirmation status: {conf_data['status']}")
    
    print("7. Approving workspace and triggering version/sync...")
    resp = httpx.post(f"{BASE_URL}/stories/{story_id}/plot-workspace/approve", json={
        "decision": "Approve All",
        "custom_user_instruction": ""
    }, headers=headers)
    resp.raise_for_status()
    approve_data = resp.json()["data"]
    print("   ✅ Workspace Approved!")
    print(f"   Created Events: {len(approve_data.get('created_events', []))}")
    print(f"   Created Patches: {len(approve_data.get('created_patches', []))}")
    print(f"   Created Version Candidate: {approve_data.get('created_version_candidate')}")
    sync = approve_data.get('sync_results', {})
    print(f"   Graph Sync: {sync.get('graph_sync')}")
    print(f"   Vector Sync: {sync.get('vector_sync')}")
    print(f"   Continuity Sync: {sync.get('continuity_sync')}")

if __name__ == "__main__":
    test_workflow()
