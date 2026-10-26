# LightFold Studio

Parametric sculpture design, lighting study, WLED control and 3D-fabrication environment for interchangeable 3D-printed lamp shades.

**Current status: Phase 3 — generative form studio.** Five shade families (Cylinder, Twist, Ripple, Organic, Fold) grow from the standardized collar and export with it as one fused, validated solid. Lighting simulation (Phases 5–6) and WLED control (7) are *not* built yet; their workspaces say so explicitly.

## What works now

| Area | Status |
| --- | --- |
| Responsive iPad-first shell, five workspaces, light/dark theme | ✅ |
| Interactive 3D viewport (orbit / pinch-zoom / two-finger pan, perspective + ortho, top/front/side, fit, clay / wireframe / normals / inspection, section view, bounding box, reference base ghost) | ✅ |
| Units: millimetres internally; display in inches or mm; inputs accept `3 15/16`, `100mm`, `3.9375"`, `1 cm` | ✅ |
| Parametric collar: base interior diameter, diametral clearance, insertion height, wall / inner diameter, lead-in chamfer, shoulder height + OD / rim overlap | ✅ |
| Optional collar features (off by default): inner retention lip, alignment key, magnet/sensor pockets | ✅ |
| Fit calibration: test ring set (default 0.20 / 0.40 / 0.60 mm), test heights 5 / 10 / full / custom, ID notches, choose clearance, lock collar | ✅ |
| Exports: collar STL, single fit-test STL, fit-test ZIP with JSON manifest; blocked on fatal errors unless "Diagnostic export" is on | ✅ |
| Mesh validation from actual triangles: watertight, manifold edges, winding, positive volume, components, degenerate faces, self-intersections, Manifold-kernel acceptance, build volume | ✅ |
| Project library in IndexedDB: save / save-as / duplicate / rename / delete / revisions + restore / thumbnails / JSON import & export; autosaved working copy | ✅ |
| Form Studio: cylindrical shade — height (or overall height), maximum diameter, wall thickness, base transition height and profile (smooth / linear) | ✅ Phase 2 |
| Shade + collar fused into one solid with Manifold; lampshade STL export | ✅ Phase 2 |
| Assembly checks: flush attachment at the shoulder, maximum-diameter envelope, collar region unchanged by the shade, overhang guidance | ✅ Phase 2 |
| Sculptural families: Twist / Helix, Ripple / Fluted, Organic / Flow, Fold / Pleat — live controls, examples, Vary, seeds | ✅ Phase 3 |
| Shared dimensions (height, maximum-diameter envelope, wall, transition) kept across families | ✅ Phase 3 |
| Guardrails: envelope fit, pinch clamp, measured minimum wall, steepness / thinning, pattern-aware sampling, overhang share | ✅ Phase 3 |
| Instant draft preview while dragging, then fused + validated preview when you pause | ✅ Phase 3 |
| Further families (crumpled paper, louvers, perforations) and hybrids | ⏳ later phases |
| Light Lab | ⏳ Phase 5–6 |
| Live Light (WLED) | ⏳ Phase 7 |
| Shade-only export with joint, multipart splitting | ⏳ Phase 8 |

## Quick start

Requires Node 20+ (tested with Node 22).

```bash
npm install
npm run dev          # http://localhost:5173, also exposed on your LAN
npm test             # geometry, validation, export and schema tests
npm run build        # typecheck + production build into dist/
npm run preview      # serve the production build on the LAN
```

### Using it on an iPad

1. Run `npm run dev` (or `npm run build && npm run preview`) on a computer on the same Wi-Fi network.
2. Vite prints a `Network:` URL such as `http://192.168.1.20:5173/`. Open it in Safari on the iPad.
3. Exports download through Safari's download manager (Files → Downloads). If Safari doesn't start a download automatically after a long build, tap **Download again**.

Projects are stored in the browser's IndexedDB on each device. Use **Library → Export JSON** to back up or move designs between devices.

### GitHub Pages

`.github/workflows/deploy.yml` tests, builds with `BASE_PATH=/<repo>/` and deploys `main` to GitHub Pages. Enable it once under **Settings → Pages → Source: GitHub Actions**.

The hosted app is fully functional for design and export. It does **not** solve local WLED connectivity: an HTTPS page generally cannot call a plain-HTTP device on your LAN (mixed content / private-network restrictions). Phase 7 will add a transport layer with direct-LAN, local-bridge and offline modes, plus setup instructions.

## Collar geometry

All dimensions are in millimetres. `z = 0` is the bottom of the insertion region.

```
          ┌───────── shoulder OD ─────────┐
 z = Hi+Hs ┌──────┐                ┌──────┐   ← shade attachment boundary
           │      │                │      │     (outer top edge of shoulder)
 z = Hi    └──┐   │                │   ┌──┘   ← rests on base rim
              │   │                │   │
              │   │   insertion    │   │      insertion OD = base ID − clearance
              │   │                │   │      inner ⌀ = insertion OD − 2 × wall
 z = 0        └───┘ (lead-in chamfer outside)
```

Defaults (all editable):

| Parameter | Default |
| --- | --- |
| Base interior diameter | 3 15/16" = 100.0125 mm |
| Diametral fit clearance | 0.40 mm → insertion OD 99.6125 mm |
| Insertion height | 1/2" = 12.7 mm |
| Wall thickness | 1/16" = 1.5875 mm |
| Lead-in chamfer | 0.6 mm |
| Shoulder height | 1/8" = 3.175 mm |
| Shoulder OD | 106.01 mm (≈ 3 mm rim overlap — **set this from your base rim**) |

These are starting values, not guaranteed fabrication tolerances. Print the fit-test rings, try them in the real base, then choose and lock the clearance.

The collar is generated by revolving a closed cross-section (watertight by construction). The key, pockets and ID notches are added with Boolean operations in the [Manifold](https://github.com/elalish/manifold) WebAssembly kernel. Every build — preview and export — runs in a Web Worker and is validated from the triangle data.

## Cylindrical shade (Phase 2)

The shade starts at the collar's attachment boundary — the top outer edge of the shoulder — with its outer surface flush with the shoulder wall. Over the *transition height* it moves out to the *maximum diameter*, then continues straight to the top. The smooth profile is a cosine ease, so the wall leaves the shoulder vertically and meets the body tangentially; the linear profile is a straight cone.

- Wall thickness is measured normal to the surface, so sloped sections keep their full thickness.
- Maximum diameter must be at least the shoulder outer diameter (setting it equal gives a straight cylinder).
- The shade solid reaches 1 mm down into the shoulder (or half the shoulder height if less) and is unioned with the collar by Manifold. A check confirms everything below the attachment plane is still exactly the collar.
- Defaults: 9" overall height (8 3/8" shade on the 5/8" collar), 5" body diameter, 1.2 mm wall, 1" smooth transition.
- The lampshade exports standing on the collar, as installed. The shoulder underside overhang warning still applies; check it in Bambu Studio.

Shade families implement the `ShadeGenerator` interface in `src/geometry/generators/types.ts` (defaults, parameter checks, summary, closed-solid build) and are registered in `registry.ts`. The assembly, validation and export paths are shared, so later families only add a generator and its controls.

## Sculptural families (Phase 3)

| Family | Controls | Notes |
| --- | --- | --- |
| **Twist** | twist angle, lobes, lobe depth, rotation, taper, curvature | Lobed cross-section rotating with height; the sampling grid rotates with it so ridges stay crisp. |
| **Ripple** | wave count, amplitude, frequency, phase | Frequency 0 gives straight flutes; above 0 the flutes alternate with height for a quilted ripple. |
| **Organic** | bulge, asymmetry, curvature, smoothness, seed | Seeded periodic harmonics (mulberry32): the same seed always rebuilds the same form. |
| **Fold** | fold count, depth, sharpness, rotation | Segment count is a multiple of 2 × folds so every ridge and valley is a vertex column (crisp creases). |

All four share one **radial-shell engine** (`src/geometry/generators/shell/engine.ts`). A family only supplies the outer radius r = F(θ, u); the engine:

1. fits the form inside the maximum diameter (uniform radial scale, reported when it applies),
2. blends it out of the collar over the transition height with a cosine ease, so the wall leaves the shoulder vertically and exactly flush,
3. clamps pinched areas to a minimum printable radius,
4. offsets the inner wall radially by t·√(1 + (∂r/r∂θ)² + (∂r/∂z)²) so the wall is t thick measured normal to the surface,
5. sweeps outer wall, rim, inner wall and the overlap tab into one closed loop per angular column — watertight by construction,
6. measures the thinnest wall (point-to-triangle), the steepest wall and the share of surface beyond the overhang limit.

Because every height slice is a single loop around the axis and the inner radius is below the outer at every sample, the walls cannot cross by construction. Sampling density adapts to each pattern's curvature (chord error ≤ ¼ wall). The collar is revolved with the shade's segment count so the fused seam coincides exactly.

**Guardrails.** Errors block export: diameter below the shoulder, wall below the printer minimum, a transition too short for the family, a measured wall below the minimum, or areas so steep the wall would thin below the minimum. Warnings: overhang share, envelope scaling, features too dense for the wall, ripples too fine to print.

**Live preview.** Dragging shows a draft (shade and collar side by side, ~10–20 ms, labelled *Draft*). About ¼ s after you stop, a second worker builds the fused solid and validates it. Previews skip only the all-pairs self-intersection test; every export rebuilds at full resolution (~256k triangles) and runs every check, including self-intersection.

**Adding a family:** add its parameters to `ShadeDesign` in `src/types/project.ts`, implement a `ShellFamily` (or a full `ShadeGenerator`), and register it in `registry.ts`. Controls, examples, thumbnails, validation and export come for free.

## Architecture

```
src/
  app/                 App root and global styles
  components/          layout (top bar), controls (length / number fields, toggles), viewport (R3F)
  features/            form, lighting, wled, fabrication, library workspaces
  geometry/
    core/              MeshData, revolve, transforms
    collar/            collar parameters, derived dimensions, checks, cross-section
    generators/        shade generator interface, registry, cylinder family
      shell/           radial-shell engine and the twist / ripple / organic / fold families
    kernel/            Manifold WASM wrapper
    validation/        mesh validation + self-intersection
    export/            binary STL writer / parser
    buildPart.ts       part builder used by worker and tests
  services/            worker client, storage (IndexedDB), downloads, exports
  workers/             geometry worker
  state/               zustand stores (project, view, geometry)
  types/               project schema
  utils/               units
```

Design rules:
- The fabrication mesh is the source of truth. The viewport renders the same `MeshData` that is exported (only normals are added for shading).
- Cylinder previews use 144 segments; sculptural previews ~120 segments × 3.5 mm rows (~33k triangles, ~0.15–0.2 s fused + validated, drafts ~10–20 ms). Exports rebuild at 360+ segments × 1.25 mm rows (~256k triangles, a few seconds) and re-validate.
- Project data is versioned (`schemaVersion: 1`) with reserved fields for shades, lighting, WLED presets and physical shade identification.

## Testing

`npm test` runs Vitest against the real geometry code and the Manifold WASM kernel:

- Unit conversion and fraction parsing.
- Collar defaults, clearance math (0.20/0.40/0.60 mm → 99.8125/99.6125/99.4125 mm), attachment boundary, profile validity.
- Validator catches holes, flipped faces, inverted normals, disconnected shells, self-intersections, degenerate faces and build-volume overflow.
- Collar and fit-test builds are valid solids with the expected dimensions; features merge into one solid; builds are deterministic.
- Exported STL re-parses to a watertight mesh with the same volume, accepted by Manifold.
- Shade generator: 9" / 5" defaults, valid cross-sections, flush start radius, wall thickness normal to the surface, parameter errors and overhang warnings.
- Assembly: one watertight genus-1 solid passing every check; exact volume for a straight cylinder; collar unchanged as shade parameters vary; maximum diameter respected; collar features still valid; STL round-trip; build-volume overflow and bad parameters are fatal.
- Families: every family's defaults and examples build a single valid solid; full fabrication validation (incl. self-intersection) passes; the envelope and height are respected; the collar is untouched; builds are deterministic; organic seeds reproduce; fold creases land on vertex columns; impossible forms are flagged.
- A randomized sweep per family checks that any parameters either get flagged or produce a mesh that is watertight, self-intersection-free and inside the envelope.
- Project JSON round-trips, partial files are filled with defaults, Phase 1 projects (`shade: null`) and Phase 2 projects (dimensions inside `cylinder`) migrate with collar and shade settings intact.

Still to test by hand: touch gestures on a physical iPad, and opening exports in Bambu Studio. Always check an STL in your slicer before printing.

## Troubleshooting

- **"Loading geometry kernel…" never clears**: the browser couldn't load `manifold.wasm`. Check the console; the server must serve `.wasm` files (Vite does).
- **Export button reports "blocked"**: open Fabrication → Export to read the validation report. Fix the listed parameter, or use Diagnostic export to inspect broken geometry.
- **Viewport is blank on an old device**: WebGL 2 is required.

## Licenses

LightFold Studio source: see repository license (not yet chosen). Third-party libraries are listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
