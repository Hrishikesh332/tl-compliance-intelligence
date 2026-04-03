Analyze this video carefully and return a single JSON object with two keys: "objects" and "face_keyframes".

1. "objects": List ALL objects relevant to safety, compliance, operations, and the scene that are clearly visible. Be COMPREHENSIVE and tag every notable item you see. Include the timestamp in seconds when each object is first clearly visible or most prominent.

   Safety and compliance: fire extinguisher, emergency exit, exit sign, first aid kit, defibrillator, AED, safety signage, hazard warning, caution tape, barrier, cone, cordon, PPE (helmet, hard hat, vest, high-vis, goggles, gloves, mask, respirator), emergency door, stairwell, fire alarm, smoke detector, sprinkler, extinguisher cabinet, emergency lighting, evacuation route sign, no-entry sign, safety equipment, eyewash station, safety shower, spill kit, MSDS area, hazardous materials label, chemical container, oxygen tank.

   Vehicles and transport: vehicle, car, truck, van, motorcycle, bicycle, patrol car, ambulance, police vehicle, dashboard, steering wheel, license plate, headlights, windshield.

   Buildings and infrastructure: door, gate, fence, window, stair, ramp, elevator, hallway, corridor, parking lot, road, intersection, traffic light, stop sign, crosswalk.

   Law enforcement / bodycam: body camera, radio, handcuffs, badge, uniform, weapon, holster, flashlight, baton, evidence bag, clipboard, ID card, document, phone, tablet, dashboard camera.

   General scene: person, people, crowd, building, street, sidewalk, interior, exterior, desk, table, chair (if in a compliance/safety context), whiteboard, monitor, screen, key, lock.

   List each object with a short, descriptive tag (e.g. "Fire extinguisher", "Patrol car", "Officer badge", "Emergency exit sign"). Use the timestamp in seconds. Do NOT list purely decorative items (vase, painting, potted plant) unless they are relevant to the scene. Aim for 15-40 object tags if the video shows that much; do not skip items.

2. "face_keyframes": Provide timestamps for UNIQUE, CLEAR faces that are IDEAL for downstream face detection and cropping. Critical rules:
   - Identify each DISTINCT INDIVIDUAL in the video.
   - For each person, choose ONE timestamp where that person's face is:
       * Front-facing or near front-facing (both eyes and mouth visible).
       * As large as possible in the frame (face occupies a good portion of the image).
       * In good, even lighting (not heavily shadowed, not blown out).
       * Minimally blurred (little motion blur, sharp facial features).
       * Not occluded (no major obstruction by hands, objects, other people, or UI overlays).
   - Prefer moments when the person is relatively still (e.g. speaking to the camera, standing/sitting facing the officer) rather than running or turning quickly.
   - Include ONLY moments where the face is clearly identifiable. Do NOT include: back of head, strong profile-only views, face in deep shadow, heavy motion blur, masks that hide most of the face, or faces that are very small in the frame.
   - List up to 5 timestamps, one per distinct individual. If there are 2 people in the video, list 2 timestamps (their clearest moment each). If 5 people, list 5. Do not duplicate the same person at multiple times; pick the single best frame for each person.
   - Each entry: "timestamp" (seconds) and "description" (e.g. "Officer 1, clear front-facing face", "Driver, frontal face near camera").

Respond with ONLY a JSON object in this exact shape. CRITICAL: You MUST analyze the video and set every "timestamp" to the actual second (0, 1, 2, ... to end of video) when that object or face appears. Do NOT use the placeholder value -1. Replace all -1 values with real timestamps from the video.

{
  "objects": [
    {"object": "Fire extinguisher", "timestamp": -1},
    {"object": "Emergency exit sign", "timestamp": -1}
  ],
  "face_keyframes": [
    {"timestamp": -1, "description": "Officer facing camera"},
    {"timestamp": -1, "description": "Second person face visible"}
  ]
}

Rules:
- Use only double quotes and valid JSON. No trailing commas.
- "timestamp" must be a number: the actual second (from 0 to video end) when that object or face appears in the video you are analyzing. Never use placeholder or example values.
- For objects: be thorough and list many tags (15-40+ if the video contains them). Each object appears once with its real timestamp from the video.
- For face_keyframes: one timestamp per UNIQUE person, the second when that person's face is clearest and most front-facing. Same person at different orientations = one entry (pick their best moment). Use real seconds from the video. Up to 5 entries (one per distinct individual).
