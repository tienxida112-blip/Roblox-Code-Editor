# Luau Studio

An independent Roblox-aware editor built with HTML, CSS and JavaScript. To deploy on GitHub Pages, upload **all files and folders** to the repository root and enable Pages from `main`. In particular, the `runtime` directory must contain `worker.js`, `mock.js`, `json.js`, `http.js`, and `api-metadata.js`, and the full `vendor/luau-web/src` directory must be present. A placeholder file alone will not work. To run locally, serve the folder over HTTP: `python3 -m http.server 8000`, then visit `http://localhost:8000/`. Direct `file://` opening does not reliably support the worker-based runner.

## Projects and importing

- The **+ beside EXPLORER** opens a menu for **New script**, **New project**, and **All projects**. Projects are separate browser-local workspaces; creating one does not delete the old one. Use the project name in the top bar (or **All projects** on mobile) to switch back. Existing workspaces from earlier versions migrate automatically on first load.
- **Import** accepts one or more text `.lua`, `.luau`, or `.txt` files, up to 2 MiB each. Choose the script type in the import dialog: use **LocalScript** for client GUI scripts, or **Exploit script** for executor mocks. Auto-detection recognizes `.client.luau`, `.exploit.luau`, and `.module.luau`; other filenames default to Script. Duplicate names get a numbered suffix. Import does not support `.rbxl`, `.rbxlx`, or binary Roblox place/model files.
- Workspaces are stored in this browser on this device. They can be lost if browser data is cleared, and are not synced or uploaded to GitHub. Use **Export** to back up each important script.

## Real HTTP requests

`game:HttpGet(url)`, `game:HttpGetAsync(url)`, `game:HttpPost(url, body, contentType)`, `HttpService:GetAsync`, `PostAsync`, and `RequestAsync` make **real browser HTTP requests**, as do the executor-mode `request`, `http_request`, `http.request`, and `syn.request` functions. Before the first request in each run, the editor asks whether to allow it; denying it makes requests in that run fail. An allowed run can request other URLs and methods too. External UI images and public Roblox asset images require their own separate consent in the UI viewer. The optional third-party RoProxy fallback requires an additional consent. Only allow scripts you trust: a script can send data or change remote services. Script HTTP requests omit browser cookies, but the destination can see your IP address and any data or authorization headers the script sends.

```luau
local http = game:GetService("HttpService")
local ok, result = pcall(function()
    return http:GetAsync("https://raw.githubusercontent.com/luau-lang/luau/master/README.md")
end)
if ok then
    print(string.sub(result, 1, 200))
else
    warn(result)
end
```

The implementation uses `fetch` inside the browser, **not a CORS-bypassing proxy**. The server must permit cross-origin requests, including any preflight required by custom headers or POST content types. GitHub Pages uses HTTPS, so browsers may also block plain HTTP as mixed content. An error mentioning CORS may also be a network failure; consult the browser console. Importantly, the browser can send a request before blocking its response, so a CORS error does not guarantee that a POST had no effect. The site cannot access a real Roblox session or bypass executor/Roblox security restrictions.

Credentials are omitted. Browser-forbidden headers such as Cookie and Host are rejected; a requested User-Agent is omitted with a warning, and the browser supplies its own. Other headers including Authorization can be sent if the target allows them. There is no fixed HTTP response-size, request-count, or dynamic-source-size limit. Very large responses and many downloads can use substantial memory and may slow or crash a browser tab; device and WebAssembly memory limits still apply. Request bodies remain limited to 1 MiB, and each HTTP request times out after 60 seconds. The default run timeout is 30 seconds; choose a longer timeout or **Until stopped** under Editor settings. The permission dialog pauses that clock. An approved script and the code it downloads may request additional websites during the same run. Response bodies with common binary MIME types (images, audio, video, octet-stream, PDF, ZIP, gzip, WebAssembly and protobuf) are preserved as byte strings, including in mock files; other MIME types are decoded as UTF-8 text, so binary data mislabeled as text may be corrupted. Request compression and custom timeouts are unsupported. Browser-readable response header names are lowercased. `HttpService` and `game:HttpGet` are browser approximations and do not run from a Roblox server. Do not embed secrets in scripts that others can read.

## Color previews

The editor shows a COLORS strip and inline color underlines for literal `Color3.fromRGB(r, g, b)`, `Color3.new(r, g, b)`, `Color3.fromHSV(h, s, v)`, `Color3.fromHex("#RRGGBB")`, and standalone quoted `#RGB`/`#RRGGBB` strings. Click a hex label to select its source, or click its swatch to choose a color and update the literal; undo works normally. Only static numeric/hex literals are previewed—variables, expressions and interpolated strings are not evaluated. Up to 60 swatches are shown at once.

## UI viewer

Open **UI viewer**, add the example UI script or run your own LocalScript/Exploit script. A `ScreenGui` parented to the mock `PlayerGui`, `CoreGui`, `StarterGui`, or `gethui()` appears in the preview. Basic frames, text and image GUI objects, UDim2 positioning/sizing, colors, transparency, `UICorner`, `UIStroke`, `UIGradient`, `UIListLayout`, `UIPadding`, and aspect-ratio constraints are approximated. ScrollingFrames can be scrolled in the preview. Buttons, text-box editing, and simple mouse/touch input and drag events are supported; they may be used after the script finishes or while it yields in `task.wait()`. While a script is running, interactions are queued and processed on the next supported wait; a tight loop without yielding cannot respond. Use **Stop** for long-running scripts. The viewer is reset on each new run and its snapshot is capped at 500 GUI objects; hidden container descendants are skipped until shown. The preview scales its simulated 800 × 450 canvas to fit the screen. During pointer callbacks, measured preview positions and sizes are supplied for the target and up to 79 descendants to improve drag and slider hit testing.

This is a **partial browser rendering**, not the Roblox engine. Layout, fonts, Z-order, text scaling, clipping, rotations and other properties can differ, and many GUI classes/features, async scheduling and interactions are not implemented. Click **Load images & assets** and grant permission to load direct HTTP(S) images and Roblox image assets (`rbxassetid://`, numeric IDs and Roblox asset URLs). Public Roblox image assets are requested from Roblox asset delivery using normal browser image requests. Roblox may reject IDs that require authentication or are not image files. For those, you can separately opt into **Use RoProxy thumbnails**: this independent third-party service receives the asset IDs and your IP address and returns public thumbnails, not original assets; private or unavailable items may still fail. Thumbnail API requests omit credentials, but direct browser image requests to Roblox and its CDN may include browser cookies. Direct HTTP(S) image links use credential-free CORS fetch and are limited to 30 URLs and 1 MiB each; Roblox image loads are limited to 500 distinct asset IDs per run, with no enforced byte limit. Image hosts can see your IP address. Image tint, fit/crop, and sprite rectangles are approximated; large tinted nine-slice panels may use plain-color placeholders. Do not rely on it for a pixel-perfect or complete test; use Roblox Studio for that. Pointer, hover, focus, layout, text input, animation and event behavior are only partial; scripts that do not yield cannot respond to preview events. Long-running scripts can be stopped, leaving a non-interactive snapshot. The viewer runs only the current script, not all files in a project.

## Run

**Check code** compiles your current script with the bundled Luau WebAssembly compiler without running it, and highlights syntax errors. The status bar says whether the compiler is ready. The separate Roblox suggestions and linter are approximate and are not a full Roblox type checker.

**Run** executes your current script using the same Luau WebAssembly VM in a worker. Output and Luau compile/runtime errors appear in the Output panel; error lines are highlighted when possible. Each run is isolated and starts fresh. Press **Stop** to terminate a run; the default run timeout is 30 seconds and can be changed to up to five minutes or **Until stopped** in Editor settings.

### Roblox mock: deliberately incomplete

The API-dump snapshot supplies class inheritance, public scriptable member names, enum names/items, and service names for validation and autocomplete. For `game:GetService(name)`, only service names marked as real services in the API-dump snapshot are accepted. Each service name returns the same simulated service object within a run; a known non-service class returns `nil`, and an unknown class name raises an error. `FindService` does not create an absent service. These are local objects, not services from a live Roblox game. Accessing an unknown member or writing an unknown/read-only property raises an error. **Being listed in the dump does not implement the behavior of an engine API.** Known but unimplemented methods raise an explicit error rather than pretending to succeed.

Implemented approximations include:

- Instance creation and parenting, `GetChildren`/`GetDescendants`, ancestor/descendant lookups and hierarchy signals, cloning, destruction, `IsA`, attributes, property signals, mock `Players` and `RunService` basics, `BindableEvent` and `BindableFunction`. Deprecated Roblox `children`/`getChildren` aliases are available; `GetChildrens` is not a Roblox method.
- LocalScript and ExploitScript runs start with a mock LocalPlayer, a basic R15-shaped character (including `Humanoid`, `HumanoidRootPart` and `Head`), and a mock camera and mouse. A server Script still has no `LocalPlayer`. These are deterministic local approximations, not an avatar, physics, or replication from a real game.
- `WaitForChild` returns an existing child immediately, honors zero or positive timeouts, and polls the mock hierarchy while yielding. Spawned tasks and events use an approximate scheduler, not Roblox replication; indefinite waits are stopped by the run timeout.
- Enums; vector arithmetic; `Color3`, `UDim`, `UDim2`, `TweenInfo`, and matrix-based `CFrame` construction and multiplication; and `typeof` labels for supported mock values. Some operations, argument validation and defaults are still incomplete.
- Local `HttpService:JSONEncode`, `JSONDecode`, `UrlEncode`, and pseudo-random `GenerateGUID`; real browser HTTP is described above. The simple JSON decoder maps `null` to Luau `nil`; it does not preserve null elements in arrays or all Roblox-specific JSON types.
- In-memory DataStore get, set, update, increment and remove, isolated to each run; CollectionService tagging and signals. These are not real Roblox persistence or services.
- Mock `TweenService:Create`; `Play()` applies final properties immediately instead of animating. `task.wait` uses a worker timer and can process preview interactions while yielding; `task.spawn` is synchronous, and `task.defer` callbacks are queued until supported yields, input events, or the end of the script. `task.delay` is approximate and can block the calling task. None matches the full Roblox scheduler. Runs are still subject to the selected time limit.

Mock properties can have simplified defaults and do not simulate a real 3D world. Events fire only for supported mock operations; there is no real player lifecycle, physics, Roblox rendering, Roblox game networking or Roblox server, and most engine methods are unimplemented. Test actual behavior in Roblox Studio.

### Executor mock

Choose **Exploit script · executor client** when creating a script (or use the **Executor mock playground** template). Its mock globals are available for checks such as `if not gethui then ... end`.

- `gethui` returns a stable, parentable fake `CoreGui`-shaped container; it does not render a real Roblox GUI. Also available: `syn.protect_gui`, `syn.unprotect_gui`, `cloneref`, `getgenv`, `getrenv`, `identifyexecutor`, `getexecutorname`.
- An in-memory filesystem: `makefolder`, `isfolder`, `listfiles`, `isfile`, `readfile`, `writefile`, `appendfile`, `loadfile`, `delfile`, and `delfolder`. `appendfile` requires an existing file; `listfiles()` defaults to the mock root.
- `getconnections`, `firesignal`, `fireclickdetector`, `fireproximityprompt`, and `firetouchinterest` work on mock signals; `getinstances`, `getnilinstances`, and `getscripts` list mock objects. `loadstring` compiles Luau in the same sandbox. `getclipboard` and `setclipboard` use a private mock clipboard, not the system clipboard.
- `Drawing.new` creates in-memory shape objects with validated properties but **does not render**. A subset of executor `bit` functions uses Luau's `bit32`. `setreadonly` can freeze a table, but the sandbox cannot unfreeze it. Metatable helpers only work within the sandbox.
- Stand-ins for `getgc`, `newcclosure`, `hookfunction`, `hookmetamethod`, and `queue_on_teleport` deliberately **do not** alter a real executor or Roblox. They warn about their simulated behavior. `getgc` returns an empty list, `hookfunction` returns the original without hooking it, and queued code is not run after teleport.
- `request`, `http_request`, `http.request`, and `syn.request` make real browser HTTP requests after permission. They are still subject to CORS, HTTPS, browser header restrictions, and the limits above; they are not a real executor.

**Files and the mock clipboard disappear after each run**, including when stopped. Absolute paths and `..` are rejected, at most 300 files may be created. Files and dynamically compiled source have no fixed size cap but still consume limited browser memory. None of these APIs connect to a real Roblox process or executor. Other suggested executor APIs may be unavailable.

Example (Exploit script type):
```luau
makefolder("demo")
writefile("demo/hello.txt", "Hello from the mock!")
print(readfile("demo/hello.txt"))
local gui = Instance.new("ScreenGui")
syn.protect_gui(gui)
gui.Parent = gethui()
print(gui.Name, #listfiles("demo"))
```

## Editor

Open **⚙ Editor settings** beside the tabs to configure automatic matching brackets/quotes, auto indent, word wrap, automatic suggestions, line numbers, indentation size, and font size. Settings are saved in this browser. Auto-pairs can wrap a selection and Backspace removes an empty pair. Word wrap adjusts the line-number gutter to the height of wrapped lines.

The **↶ / ↷** buttons work on touch screens; keyboard shortcuts are Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z, and Ctrl+Y for redo. History is kept separately for each file while the page is open, but is not retained after reloading; it is limited to 100 states and approximately 8 MiB per file. Tab/Shift+Tab indent/outdent selected lines, and Ctrl/Cmd+/ toggles line comments. The formatting command uses the chosen indent size. Auto indentation and pair matching are lightweight heuristics, not the VS Code editor engine.

- Projects, files, and tabs save in browser local storage. Export important scripts as backups.
- Run the included checks with `node tests/runtime.mjs`, `node tests/compiler.mjs`, `node tests/ui-viewer.mjs`, `node tests/http.mjs`, and `node tests/hierarchy.mjs` (Node 20+).
- Luau syntax highlighting, line numbers, approximate diagnostics, API-aware suggestions and executor-global suggestions. Suggestions recognize both `game:GetService("Players")` and `game:GetService'Players'`, including chained members.
- Ctrl/Cmd+Space shows suggestions; Ctrl/Cmd+F finds text; Ctrl/Cmd+S saves locally.
- Templates create new files. Static checks and formatting are independent heuristics, not the official Luau type checker.

## Sources and attribution

- [Luau](https://github.com/luau-lang/luau) is the underlying language.
- The VM uses [luau-web 1.5.1](https://github.com/xNasuni/luau-web), which bundles a Luau-based WebAssembly build from luau-interop. Its MIT license is included at `vendor/luau-web/LICENSE`. This is a fork/binding, not a direct build of the latest Luau repository.
- `src/roblox-api-dump.js` and `runtime/api-metadata.js` are generated from the supplied [Roblox Client Tracker API dump](https://github.com/MaximumADHD/Roblox-Client-Tracker/blob/roblox/API-Dump.txt). Snapshot: `de521910e9616a0a3add5fad22bef66a9e406e41`. Private/hidden/deprecated items are filtered where tagged. To regenerate both after replacing `api-dump.txt`, run `python3 scripts/build-api-dump.py` and `python3 scripts/build-runtime-metadata.py`.
- This project is not affiliated with Roblox.

### Additional documentation consulted

Behavior of selected mocks was checked against the [Roblox ServiceProvider reference](https://create.roblox.com/docs/reference/engine/classes/ServiceProvider), [Roblox RBXScriptSignal reference](https://create.roblox.com/docs/reference/engine/datatypes/RBXScriptSignal), [Synapse X file functions](https://synapsexdocs.github.io/custom-lua-functions/file-functions/), [Synapse X syn library](https://synapsexdocs.github.io/libraries/syn/), and [Fluxus filesystem](https://fluxusrbx.gitbook.io/fluxus/filesystem). Synapse and Fluxus documents are historical and may describe different executor versions. These references do not supply the Roblox engine or a real executor.

### Large UI libraries and WindUI

The normal executor loader pattern `loadstring(game:HttpGet(url))()` can fetch larger libraries after network permission is granted. HTTP responses and `loadstring` source no longer have a fixed size limit; scripts and their dependencies remain subject to browser memory, CORS, HTTPS, individual request timeouts, and the selected run timeout. Large HTTP responses are transferred to Luau in chunks. `Rect`, `Font`, `ColorSequence`, `NumberSequence` and their keypoints, enum-name assignment, and approximate GUI absolute sizes/list content sizes are available as partial mocks. Avatar thumbnails are not fetched: the mock returns an empty URL and `false`. Geometry uses a simulated 800 × 450 viewport and is not Roblox's layout engine.

To try the official `main.client.lua` WindUI example as a **LocalScript**, paste the complete example and run it. The editor recognizes its `require("./src/Init")` and official distribution URL and, for this specific example, simulates the missing Studio module by downloading the public WindUI distribution after network permission. This adapter does not implement arbitrary ModuleScript requires or expose executor functions to the LocalScript. It also enables the false-UDim-offset workaround for that run and supplies module-local URL-image helpers; the output reports these compatibility choices. Open **UI viewer**, select **About WindUI**, then click its section heading to expand it. Alternatively, an **Exploit script** can use the example’s HTTP/`loadstring` loader with **WindUI compatibility** enabled in settings. Grant network access only if you trust the script. The browser omits the example’s requested `User-Agent` and uses its own. The LocalScript and Exploit paths were tested against the live distribution; a section, the Button tab, and the Highlight Button callback worked. The example and remote dependencies can change, and network/CORS availability varies.

The viewer can traverse Folder containers and approximates automatic sizes, but it is **not** a full WindUI renderer. Asset thumbnails, image shapes, nine-slice images, clipping, text, layout, asynchronous scheduling, and many controls can look wrong or be unsupported. A mock `getcustomasset` uses the original URL when a mock file was written directly from the most recent successful HTTP response; such image URLs still require separate viewer permission. Other files produce a non-rendered `mockasset://` placeholder. Common binary MIME responses are preserved as bytes in mock files, but binary data served as text may still be corrupted. Verify complete behavior in Roblox Studio or the intended Roblox environment.

### Reference UI editor

[Vanilla — Roblox UI Designer](https://vanillaui.cc.cd/) is a separate, full-featured browser UI-design product. Its layout/design workflow and live preview were reviewed as a reference; this project does not bundle or copy its code and is not a complete equivalent. The local viewer remains a partial simulation.
