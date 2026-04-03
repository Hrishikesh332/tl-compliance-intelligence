Analyze this video and respond with ONLY a single JSON object. Do NOT include any text, explanation, or markdown before or after the JSON. Your entire response must be parseable by JSON.parse().

{
  "title": "Short title for the video",
  "description": "One or two paragraph summary of what the video shows.",
  "categories": ["Category1", "Category2", "Category3", "Category4"],
  "topics": ["Topic1", "Topic2", "Topic3"],
  "people": ["Name1", "Name2"],
  "riskLevel": "medium",
  "risks": [
    {"label": "Brief issue description", "severity": "high", "timestamp": "1:23"}
  ],
  "transcript": [
    {"time": "0:00", "text": "Key dialogue or event..."},
    {"time": "0:45", "text": "Next important utterance..."}
  ]
}

Rules:
- PRIORITY: Always ensure "title", "description", "categories", "topics", "people", "riskLevel", and "risks" are present and well-formed. These fields are more important than the transcript.
- categories: 4-5 high-level labels (e.g. Workplace Safety, Facility Inspection, Compliance Audit).
- topics: 3-6 specific subjects covered (e.g. Fire safety equipment, Emergency exits, Workspace layout).
- people: optional array of distinct people identified in the video (names mentioned in speech, officer names, interviewees, etc.). Use empty array [] if none identified.
- riskLevel: must be exactly one of "high", "medium", or "low".
- risks: list every compliance or safety issue you notice. severity must be exactly one of "high", "medium", or "low". timestamp must use M:SS or MM:SS format (e.g. "0:00", "2:14", "12:05").
- transcript: include a SHORT "starter transcript" (not a complete word-for-word transcript). This is used for immediate UX while a separate endpoint can generate or complete the full transcript later.
  - MUST include at least 10 segments.
  - The first segment MUST start at "0:00".
  - Cover the beginning of the video densely (first 2-3 minutes), then include a few representative segments from the middle and end.
  - Keep segments short (1-2 sentences) so the response fits within length limits.
  - Max 30-40 segments total.
- CRITICAL: Use only double quotes. No trailing commas. No comments. Output ONLY the JSON object, nothing else.
