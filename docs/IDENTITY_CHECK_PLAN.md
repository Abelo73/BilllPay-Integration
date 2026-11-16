# Identity check for sellers: plan

Status: plan for review, 16 November 2026. No code yet.
Written for: the Sodo Gebeya team (decisions in section 9, legal review in section 3).

## 1. What we want

When someone opens a shop or signs up as a seller:

1. **Read the ID** from a photo, so the team does not type it by hand.
2. **Stop duplicates.** If the same ID already belongs to an account, do not let a second account open. Show a plain message instead.
3. **Check the selfie against the ID photo** (same person?), and check the selfie is a real live face, not a photo of a photo or a screen.
4. **Guide the seller** while they take the photos, so the first attempt works.
5. **People decide.** A machine can flag a problem, but a staff member makes the final call, as the rest of Blink does.

## 2. What exists today

- Sellers upload an ID front, back, and a selfie holding it. Staff check the photos and give the Verified badge (`verifications` table, migration V20; screens `pages/seller/verify.tsx` and the admin review).
- Photos are stored privately and only staff and the seller can see them.
- Nothing reads the ID, nothing checks for duplicates, and nothing checks whether the selfie is live.

## 3. Before any code: legal and privacy (blocking)

ID photos and face images are sensitive personal data. Matching faces, and storing ID numbers, need a legal basis and a clear notice. Do not switch on the automatic parts (3 to 5 below) until counsel has signed off.

Questions for the lawyer:
- Is face matching allowed, and what consent wording is needed? (The Ethiopian Data Protection Proclamation 1321/2024 applies; counsel to confirm the details.)
- Can we store the ID number as a keyed hash only, not in plain text? (Plan assumes yes.)
- How long can ID photos be kept after a decision? (Plan assumes deletion after a fixed number of days, to be set.)
- Can any ID check run on a third-party cloud service? If so, which country, and under what contract? (Plan assumes **no**: everything runs on our server.)

Rule for the build: **we store the result, not the raw biometrics.** We keep the match score and liveness result, not a face template or a copy of the face.

## 4. Duplicate check (phase 1, lowest risk)

**How it works**
1. Read the ID number from the card (step 5), or let the seller type it and then check it against the card photo.
2. Normalise it (remove spaces, dashes and letter case).
3. Compute an HMAC-SHA256 of the number with a server-side key. The key is kept like `TOKEN_MASTER_KEY` (sealed, outside the database, documented in `docs/Security_Key_Custody_and_Incident_Procedure.md`).
4. Store only the HMAC, in a table with a unique index on it (only for active accounts).
5. If the HMAC already exists for another account, refuse with: "This ID is already registered on Sodo Gebeya. Sign in to your existing account, or contact us if you think this is a mistake."

**Why a keyed hash:** a database leak alone does not reveal ID numbers, and the number cannot be guessed from the hash without the key.

**Limits:** someone with a second, different ID can register again. Staff should still look at repeat phone numbers and repeat selfies (see phase 4).

## 5. Read the ID (phase 2)

**Options**

| Option | Pros | Cons |
|---|---|---|
| Open-source OCR (Tesseract with Amharic and English data) on our server | Free, private, no data leaves our server | Less accurate on card photos, needs tuning |
| Cloud OCR (Google Vision, Azure) | Accurate | ID data leaves Ethiopia; needs counsel approval first (section 3) |
| Vendor SDK for Ethiopian IDs | Trained for the card | Cost, contract, data terms |

**Recommendation:** start with Tesseract on our server, and let the seller correct any field. Measure accuracy on 50 real cards (with consent) before relying on it.

**Steps**
1. Check the photo first: sharp, not blurred, no glare, all four corners visible (the existing copy already says this).
2. Read the number and the name.
3. Show the seller what was read, with a box to correct it.
4. Compare the read name with the name on the account, and flag a mismatch for staff.

## 6. Selfie match and liveness (phases 3 and 4)

**Face match.** Compare the selfie with the face on the ID photo using a face-recognition model that runs on our server (for example InsightFace with ONNX Runtime). The output is a similarity score. Set the threshold with real test data. Below the threshold, send to staff review; do not reject automatically.

**Liveness (is the face real?)**

| Level | How | Protects against | Weakness |
|---|---|---|---|
| Passive | One selfie; a model says "real face or not" | Printed photos, some screen replays | Open-source models are weak against good fakes |
| Active | Seller follows prompts: "turn your head left", "blink" | Most photo and video replays | Takes longer; some older or disabled people find it hard |

**Recommendation:** active liveness with prompts, camera only (no gallery uploads), plus a certified vendor check before production. Do not claim "real face detection" to users until a vendor or a published test backs it.

**Extra checks**
- Take the selfie from the **live camera** only. Refuse photos picked from the gallery.
- Check the image was taken now (the camera stream, not an old file).
- Look for a second face, or a face on a screen (glare, moiré pattern).
- Limit attempts: three tries, then "send for staff review".

## 7. Selfie guidance (what the seller sees)

Show this before the camera opens, in plain language (Amharic and English):

**Before you start**
- Find a bright place. Face the light; do not stand with a window or lamp behind you.
- Take off glasses, hat, mask and anything covering your face.
- Hold the phone at eye level, about an arm's length away.
- Be alone in the photo.

**While the camera is on** (live messages, updating as the seller moves):
- "Face not found. Look at the camera."
- "Too dark. Move to a brighter place."
- "Too close. Move the phone back a little."
- "Too far. Bring the phone closer."
- "More than one face. Only you should be in the photo."
- "Hold still" (when the face is in the oval).
- Prompts for active liveness: "Turn your head slowly to the left", "Now to the right", "Blink once".

**For the selfie with ID**
- Hold your ID next to your face, both clearly visible.
- Keep your fingers off the card and off your face.

**After**
- A green tick when the photo is good. Otherwise the reason and a "Try again" button.

## 8. Steps to build, in order

| Phase | What | Who | Rough size |
|---|---|---|---|
| 0 | Counsel review (section 3). Decide options in section 9. | You, counsel | 1 to 3 weeks (calendar) |
| 1 | Duplicate check by keyed hash, with the refusal message and tests | Developer | 3 to 4 days |
| 2 | ID reading with Tesseract, the correction screen, name check | Developer | 1 to 2 weeks, plus testing on real cards |
| 3 | Selfie guidance screens and live camera capture (camera only, no gallery) | Developer | 1 week |
| 4 | Face match on our server, threshold set with test data | Developer | 1 week |
| 5 | Active liveness prompts, then vendor check before production | Developer, vendor | 2 weeks + vendor time |
| 6 | Staff review screen shows scores, duplicate hits and the photos (existing queue, extended) | Developer | 3 to 4 days |
| 7 | Test with real people (with consent), tune thresholds, check older users and poor lighting | Team | 1 to 2 weeks |

Phases 1 and 3 can start as soon as section 9 is answered. Phases 4 and 5 wait for counsel and for the test data.

## 9. Decisions needed

1. **Is face matching allowed** after counsel review? If not, we do phases 1, 2, 3 and 6 only.
2. **Duplicate rule**: block a second account with the same ID, or flag it for staff?
3. **Liveness level** for launch: passive only, or active prompts?
4. **Vendor**: open-source only for now, or pay for a certified vendor check before go-live?
5. **Retention**: how many days to keep ID and selfie photos after a decision?
6. **Who reviews**: which staff member(s) decide when a check fails?
7. **Languages**: Amharic and English for the guidance, or English only at first?

## 10. Testing

- **Unit tests:** ID normalisation, keyed hash, duplicate refusal, threshold logic.
- **Integration tests:** a second registration with the same ID is refused; a gallery upload for the selfie is refused; a failed match goes to staff review, not to rejection.
- **Test data:** use synthetic cards and generated faces in the repo. Never commit real ID photos or real faces. Real tests run only with the consent of the people involved.
- **Field test:** 20 to 30 people on different phones and lighting, including older people, before go-live.

## 11. Known risks

- **Accuracy on Ethiopian ID cards** is not known until we test real cards.
- **Older people and some disabilities** may find active liveness hard. Keep a staff-review path for them.
- **Deepfakes and good spoofs** can beat cheap liveness. Be honest with sellers and staff about this limit.
- **False duplicates**: two people can share an ID by mistake, so the message must offer a way to contact us.
- **Data breach**: ID photos are the most sensitive data we hold. Keep them private, keep the retention short, and log every view by staff.
