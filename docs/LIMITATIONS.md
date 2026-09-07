# LIMITATIONS (mandatory reading)

- **Reverse-image indexes are incomplete.** Absence of a match proves nothing; earlier sources may exist unseen.
- **Timestamps can be unreliable.** Missing, inferred, or falsified dates are labeled by quality and never upgraded.
- **Metadata can be edited or stripped.** EXIF/C2PA are evidence, not proof.
- **Face similarity is not identity proof.** The face module is a heuristic baseline, not a biometric
  identification system or a trained morph/attack detector. Person-matching and account ownership are
  separate relationships; ownership needs explicit account-control evidence.
- **Social account ownership may be unresolved.** Public posts alone support appearance claims only.
- **Transformations may evade matching.** Heavy crops, screenshots, occlusion, and rotation degrade
  similarity; windowed containment matching mitigates but does not solve this.
- **Provider outages affect coverage.** Failed searches yield `PARTIAL` investigations; confidence
  reflects missing evidence.
- **Single-server file store.** No concurrency control, no multi-user auth, no retention policy.
- **No WEBP decode** in this build (clear error, convert to PNG/JPG).
- **Contract tests use a local simulator**, not a public testnet, in CI.
- **Provenance is evaluated evidence, not absolute truth.** The TRACE Seal certifies integrity
  (unchanged since sealing), never correctness.
- Social platforms (Instagram, X, LinkedIn) expose no public face-lookup API;
  text search cannot match a face without identifiers, and their pages/images
  usually require login. TRACE covers them via platform-scoped Exa discovery and
  still verifies every image by bytes — a login-walled image can be discovered
  but never confirmed. GitHub is the exception: avatar URLs map 1:1 to accounts
  through the free official api.github.com endpoint.
