(function (root) {
  'use strict';

  const KEYWORDS = [
    'and', 'break', 'continue', 'do', 'else', 'elseif', 'end', 'export',
    'false', 'for', 'function', 'if', 'in', 'local', 'nil', 'not', 'or',
    'repeat', 'return', 'then', 'true', 'type', 'typeof', 'until', 'while', 'self'
  ];

  const LUAU_TYPES = [
    'any', 'nil', 'boolean', 'number', 'string', 'thread', 'buffer',
    'table', 'userdata', 'never', 'unknown'
  ];

  const DIRECTIVES = [
    { label: '--!strict', detail: 'Enable strict Luau type checking', insertText: '--!strict' },
    { label: '--!nonstrict', detail: 'Enable non-strict Luau type checking', insertText: '--!nonstrict' },
    { label: '--!nocheck', detail: 'Disable Luau type checking for script', insertText: '--!nocheck' },
    { label: '--!native', detail: 'Enable native Luau code generation', insertText: '--!native' },
    { label: '--!optimize 2', detail: 'Set Luau compiler optimization level (0-2)', insertText: '--!optimize 2' }
  ];

  const GLOBALS = [
    { label: 'game', kind: 'service', type: 'DataModel', detail: 'Root DataModel instance representing the Roblox place', insertText: 'game' },
    { label: 'workspace', kind: 'service', type: 'Workspace', detail: 'Global reference to game:GetService("Workspace")', insertText: 'workspace' },
    { label: 'script', kind: 'variable', type: 'LuaSourceContainer', detail: 'Reference to the currently executing Script/LocalScript/ModuleScript', insertText: 'script' },
    { label: 'shared', kind: 'variable', type: 'table', detail: 'Table shared across scripts on the same execution boundary', insertText: 'shared' },
    { label: '_G', kind: 'variable', type: 'table', detail: 'Global environment table shared across scripts on same VM', insertText: '_G' },
    { label: 'plugin', kind: 'variable', type: 'Plugin', detail: 'Reference to the Studio Plugin object', insertText: 'plugin' },
    { label: 'Enum', kind: 'enum', type: 'Enums', detail: 'Container for all Roblox enumerations', insertText: 'Enum' },
    { label: 'Instance', kind: 'class', type: 'Instance', detail: 'Constructor namespace for Roblox Instances (Instance.new)', insertText: 'Instance' },
    { label: 'Vector3', kind: 'class', type: 'Vector3', detail: '3D vector datatype (X, Y, Z)', insertText: 'Vector3' },
    { label: 'Vector2', kind: 'class', type: 'Vector2', detail: '2D vector datatype (X, Y)', insertText: 'Vector2' },
    { label: 'CFrame', kind: 'class', type: 'CFrame', detail: 'Coordinate frame representing 3D position and orientation', insertText: 'CFrame' },
    { label: 'Color3', kind: 'class', type: 'Color3', detail: 'RGB floating-point color datatype', insertText: 'Color3' },
    { label: 'BrickColor', kind: 'class', type: 'BrickColor', detail: 'Named Roblox palette color', insertText: 'BrickColor' },
    { label: 'UDim', kind: 'class', type: 'UDim', detail: '1D UI dimension (Scale, Offset)', insertText: 'UDim' },
    { label: 'UDim2', kind: 'class', type: 'UDim2', detail: '2D UI dimension (X Scale/Offset, Y Scale/Offset)', insertText: 'UDim2' },
    { label: 'TweenInfo', kind: 'class', type: 'TweenInfo', detail: 'Parameters for TweenService:Create()', insertText: 'TweenInfo' },
    { label: 'RaycastParams', kind: 'class', type: 'RaycastParams', detail: 'Parameters controlling workspace:Raycast()', insertText: 'RaycastParams' },
    { label: 'OverlapParams', kind: 'class', type: 'OverlapParams', detail: 'Parameters controlling spatial query bounds', insertText: 'OverlapParams' },
    { label: 'NumberRange', kind: 'class', type: 'NumberRange', detail: 'Range between Min and Max numbers', insertText: 'NumberRange' },
    { label: 'Random', kind: 'class', type: 'Random', detail: 'Pseudorandom number generator object', insertText: 'Random' },
    { label: 'DateTime', kind: 'class', type: 'DateTime', detail: 'Timestamp representation and formatting utility', insertText: 'DateTime' },
    { label: 'Ray', kind: 'class', type: 'Ray', detail: 'Half-line with Origin and Direction vectors', insertText: 'Ray' },
    { label: 'Region3', kind: 'class', type: 'Region3', detail: 'Axis-aligned 3D bounding box', insertText: 'Region3' },
    { label: 'ColorSequence', kind: 'class', type: 'ColorSequence', detail: 'Gradient of Color3 keypoints', insertText: 'ColorSequence' },
    { label: 'NumberSequence', kind: 'class', type: 'NumberSequence', detail: 'Sequence of numeric keypoints over time', insertText: 'NumberSequence' },
    { label: 'task', kind: 'module', type: 'task', detail: 'Roblox task scheduler library (wait, spawn, defer, delay, cancel)', insertText: 'task' },
    { label: 'math', kind: 'module', type: 'math', detail: 'Luau math library (clamp, rad, random, noise, sin, cos, ...)', insertText: 'math' },
    { label: 'string', kind: 'module', type: 'string', detail: 'Luau string manipulation library', insertText: 'string' },
    { label: 'table', kind: 'module', type: 'table', detail: 'Luau table library (insert, remove, find, clone, sort, ...)', insertText: 'table' },
    { label: 'coroutine', kind: 'module', type: 'coroutine', detail: 'Luau coroutine library', insertText: 'coroutine' },
    { label: 'bit32', kind: 'module', type: 'bit32', detail: '32-bit bitwise operations library', insertText: 'bit32' },
    { label: 'os', kind: 'module', type: 'os', detail: 'Operating system time & clock utilities', insertText: 'os' },
    { label: 'utf8', kind: 'module', type: 'utf8', detail: 'UTF-8 string encoding utilities', insertText: 'utf8' },
    { label: 'debug', kind: 'module', type: 'debug', detail: 'Profiling and traceback utilities', insertText: 'debug' },
    { label: 'buffer', kind: 'module', type: 'buffer', detail: 'Luau binary buffer manipulation library', insertText: 'buffer' },
    { label: 'print', kind: 'function', signature: 'print(...: any)', detail: 'Prints values separated by spaces to the Output window', insertText: 'print($1)' },
    { label: 'warn', kind: 'function', signature: 'warn(...: any)', detail: 'Emits amber warning message to the Output window', insertText: 'warn($1)' },
    { label: 'error', kind: 'function', signature: 'error(message: any, level: number?)', detail: 'Terminates execution and throws runtime error', insertText: 'error($1)' },
    { label: 'assert', kind: 'function', signature: 'assert<T>(value: T, message: string?): T', detail: 'Errors if value is falsy, otherwise returns value', insertText: 'assert($1)' },
    { label: 'pcall', kind: 'function', signature: 'pcall(f: function, ...: any): (boolean, ...any)', detail: 'Calls function in protected mode, catching runtime errors', insertText: 'pcall(function()\n\t$1\nend)' },
    { label: 'xpcall', kind: 'function', signature: 'xpcall(f: function, err: function, ...: any)', detail: 'Protected call with custom error handler', insertText: 'xpcall($1)' },
    { label: 'require', kind: 'function', signature: 'require(module: ModuleScript): any', detail: 'Runs a ModuleScript once and returns its exported value', insertText: 'require($1)' },
    { label: 'typeof', kind: 'function', signature: 'typeof(value: any): string', detail: 'Returns Roblox-aware datatype string (e.g. "Instance", "Vector3")', insertText: 'typeof($1)' },
    { label: 'type', kind: 'function', signature: 'type(value: any): string', detail: 'Returns primitive Luau type ("nil", "number", "string", "table", ...)', insertText: 'type($1)' },
    { label: 'tonumber', kind: 'function', signature: 'tonumber(value: any, base: number?): number?', detail: 'Converts argument to a number or nil', insertText: 'tonumber($1)' },
    { label: 'tostring', kind: 'function', signature: 'tostring(value: any): string', detail: 'Converts any value to a string', insertText: 'tostring($1)' },
    { label: 'pairs', kind: 'function', signature: 'pairs(t: table): iterator', detail: 'Iterates over all key-value pairs in a dictionary/table', insertText: 'pairs($1)' },
    { label: 'ipairs', kind: 'function', signature: 'ipairs(t: array): iterator', detail: 'Iterates over sequential integer keys 1..#t', insertText: 'ipairs($1)' },
    { label: 'next', kind: 'function', signature: 'next(t: table, lastKey: any?): (any, any)', detail: 'Returns next key-value pair in table', insertText: 'next($1)' },
    { label: 'select', kind: 'function', signature: 'select(index: number | "#", ...: any)', detail: 'Returns variadic arguments from index or count with "#"', insertText: 'select($1)' },
    { label: 'unpack', kind: 'function', signature: 'unpack(list: table, i: number?, j: number?)', detail: 'Unpacks array elements as multiple return values', insertText: 'unpack($1)' },
    { label: 'setmetatable', kind: 'function', signature: 'setmetatable(t: table, mt: table?): table', detail: 'Sets metatable for operator overloading & OOP', insertText: 'setmetatable($1)' },
    { label: 'getmetatable', kind: 'function', signature: 'getmetatable(obj: any): any', detail: 'Returns metatable of a table/object', insertText: 'getmetatable($1)' },
    { label: 'rawget', kind: 'function', signature: 'rawget(t: table, k: any): any', detail: 'Gets table entry bypassing __index', insertText: 'rawget($1)' },
    { label: 'rawset', kind: 'function', signature: 'rawset(t: table, k: any, v: any): table', detail: 'Sets table entry bypassing __newindex', insertText: 'rawset($1)' },
    { label: 'rawequal', kind: 'function', signature: 'rawequal(a: any, b: any): boolean', detail: 'Checks equality bypassing __eq', insertText: 'rawequal($1)' },
    { label: 'tick', kind: 'function', signature: 'tick(): number', detail: 'Returns UNIX epoch seconds in local time', insertText: 'tick()' },
    { label: 'time', kind: 'function', signature: 'time(): number', detail: 'Returns seconds elapsed since simulation started', insertText: 'time()' },
    { label: 'elapsedTime', kind: 'function', signature: 'elapsedTime(): number', detail: 'Returns total time Roblox process has been running', insertText: 'elapsedTime()' },
    { label: 'wait', kind: 'function', deprecated: true, signature: 'wait(seconds: number?): (number, number)', detail: '[Deprecated] Use task.wait() instead for 60Hz precision', insertText: 'wait($1)' },
    { label: 'spawn', kind: 'function', deprecated: true, signature: 'spawn(callback: function)', detail: '[Deprecated] Use task.spawn() instead', insertText: 'spawn($1)' },
    { label: 'delay', kind: 'function', deprecated: true, signature: 'delay(delayTime: number, callback: function)', detail: '[Deprecated] Use task.delay() instead', insertText: 'delay($1)' }
  ];

  // Common executor-provided globals. These are not Roblox APIs and availability
  // and behavior vary by executor. Suggestions do not implement a runtime.
  const EXECUTOR_GLOBALS = [
    { label: 'syn', kind: 'module', detail: 'Mock executor namespace: protect_gui, request, and queue_on_teleport', insertText: 'syn' },
    { label: 'cloneref', kind: 'function', signature: 'cloneref(instance: Instance): Instance', detail: 'Mock: returns the same in-memory Instance', insertText: 'cloneref($1)' },
    { label: 'loadfile', kind: 'function', signature: 'loadfile(path: string): function?', detail: 'Compile a Luau file from the temporary mock filesystem', insertText: 'loadfile("$1")' },
    { label: 'makefolder', kind: 'function', signature: 'makefolder(path: string)', detail: 'Create folders in the temporary mock filesystem', insertText: 'makefolder("$1")' },
    { label: 'isfolder', kind: 'function', signature: 'isfolder(path: string): boolean', detail: 'Check the temporary mock filesystem for a folder', insertText: 'isfolder("$1")' },
    { label: 'listfiles', kind: 'function', signature: 'listfiles(path: string): {string}', detail: 'List children of a temporary mock folder', insertText: 'listfiles("$1")' },
    { label: 'appendfile', kind: 'function', signature: 'appendfile(path: string, contents: string)', detail: 'Append to a temporary mock file', insertText: 'appendfile("$1", $2)' },
    { label: 'delfile', kind: 'function', signature: 'delfile(path: string)', detail: 'Delete a temporary mock file', insertText: 'delfile("$1")' },
    { label: 'delfolder', kind: 'function', signature: 'delfolder(path: string)', detail: 'Delete a temporary mock folder recursively', insertText: 'delfolder("$1")' },
    { label: 'Drawing', kind: 'module', detail: 'Mock Drawing objects validate properties; they do not render', insertText: 'Drawing' },
    { label: 'bit', kind: 'module', detail: 'Bitwise utilities backed by Luau bit32', insertText: 'bit' },
    { label: 'isrenderobj', kind: 'function', detail: 'Checks for a mock Drawing object', insertText: 'isrenderobj($1)' },
    { label: 'getrenderproperty', kind: 'function', detail: 'Reads a mock Drawing property', insertText: 'getrenderproperty($1, "$2")' },
    { label: 'setrenderproperty', kind: 'function', detail: 'Writes a mock Drawing property', insertText: 'setrenderproperty($1, "$2", $3)' },
    { label: 'cleardrawcache', kind: 'function', detail: 'Removes all mock Drawing objects', insertText: 'cleardrawcache()' },
    { label: 'getscripts', kind: 'function', detail: 'Lists mock script objects', insertText: 'getscripts()' },
    { label: 'getloadedmodules', kind: 'function', detail: 'Mock: returns an empty list', insertText: 'getloadedmodules()' },
    { label: 'getcallingscript', kind: 'function', detail: 'Returns the current mock script', insertText: 'getcallingscript()' },
    { label: 'getsenv', kind: 'function', detail: 'Gets the active mock script environment', insertText: 'getsenv($1)' },
    { label: 'getrawmetatable', kind: 'function', detail: 'Returns an accessible table metatable', insertText: 'getrawmetatable($1)' },
    { label: 'setrawmetatable', kind: 'function', detail: 'Sets an accessible table metatable', insertText: 'setrawmetatable($1, $2)' },
    { label: 'setreadonly', kind: 'function', detail: 'Freezes a table; frozen tables cannot be unfrozen in the mock', insertText: 'setreadonly($1, true)' },
    { label: 'isreadonly', kind: 'function', detail: 'Checks whether a Luau table is frozen', insertText: 'isreadonly($1)' },
    { label: 'fireclickdetector', kind: 'function', detail: 'Fires a mock ClickDetector signal', insertText: 'fireclickdetector($1)' },
    { label: 'fireproximityprompt', kind: 'function', detail: 'Fires a mock ProximityPrompt signal', insertText: 'fireproximityprompt($1)' },
    { label: 'firetouchinterest', kind: 'function', detail: 'Fires mock part touch events', insertText: 'firetouchinterest($1, $2, 0)' },
    { label: 'rconsoleprint', kind: 'function', detail: 'Prints to the mock output', insertText: 'rconsoleprint($1)' },
    { label: 'rconsolewarn', kind: 'function', detail: 'Prints a warning to the mock output', insertText: 'rconsolewarn($1)' },
    { label: 'getclipboard', kind: 'function', detail: 'Read the in-memory mock clipboard', insertText: 'getclipboard()' },
    { label: 'toclipboard', kind: 'function', detail: 'Write to the in-memory mock clipboard', insertText: 'toclipboard($1)' },
    { label: 'getexecutorname', kind: 'function', detail: 'Returns the mock executor name', insertText: 'getexecutorname()' },
    { label: 'firesignal', kind: 'function', detail: 'Fire a mock signal synchronously', insertText: 'firesignal($1)' },
    { label: 'getinstances', kind: 'function', detail: 'List live instances in the mock world', insertText: 'getinstances()' },
    { label: 'getnilinstances', kind: 'function', detail: 'List mock instances without a parent', insertText: 'getnilinstances()' },
    { label: 'newcclosure', kind: 'function', detail: 'Mock: returns the supplied function without creating a real C closure', insertText: 'newcclosure($1)' },
    { label: 'http', kind: 'module', detail: 'Browser HTTP namespace; real requests after permission, subject to CORS', insertText: 'http' },
    { label: 'http_request', kind: 'function', detail: 'Real browser HTTP after permission; CORS applies', insertText: 'http_request($1)' },
    { label: 'getgenv', kind: 'function', signature: 'getgenv(): table', detail: 'Executor environment table (executor-specific)', insertText: 'getgenv()' },
    { label: 'getrenv', kind: 'function', signature: 'getrenv(): table', detail: 'Roblox environment table (executor-specific)', insertText: 'getrenv()' },
    { label: 'identifyexecutor', kind: 'function', signature: 'identifyexecutor(): string', detail: 'Returns the executor name, when supported', insertText: 'identifyexecutor()' },
    { label: 'gethui', kind: 'function', signature: 'gethui(): Instance', detail: 'Returns an executor-provided UI container, when supported', insertText: 'gethui()' },
    { label: 'setclipboard', kind: 'function', signature: 'setclipboard(text: string)', detail: 'Copies text to the clipboard, when supported', insertText: 'setclipboard($1)' },
    { label: 'request', kind: 'function', signature: 'request(options: table): table', detail: 'Real browser HTTP after permission; CORS applies', insertText: 'request($1)' },
    { label: 'loadstring', kind: 'function', signature: 'loadstring(source: string): function?', detail: 'Compiles a Luau source string if supported by the environment', insertText: 'loadstring($1)' },
    { label: 'isfile', kind: 'function', signature: 'isfile(path: string): boolean', detail: 'Checks an executor workspace file, when supported', insertText: 'isfile($1)' },
    { label: 'readfile', kind: 'function', signature: 'readfile(path: string): string', detail: 'Reads an executor workspace file, when supported', insertText: 'readfile($1)' },
    { label: 'writefile', kind: 'function', signature: 'writefile(path: string, contents: string)', detail: 'Writes an executor workspace file, when supported', insertText: 'writefile($1, $2)' },
    { label: 'getcustomasset', kind: 'function', signature: 'getcustomasset(path: string): string', detail: 'Mock asset URL from an in-memory file; no Roblox asset provider', insertText: 'getcustomasset($1)' },
    { label: 'printidentity', kind: 'function', signature: 'printidentity()', detail: 'Prints the simulated thread identity', insertText: 'printidentity()' },
    { label: 'getthreadidentity', kind: 'function', signature: 'getthreadidentity(): number', detail: 'Returns the simulated thread identity', insertText: 'getthreadidentity()' },
    { label: 'setthreadidentity', kind: 'function', signature: 'setthreadidentity(identity: number)', detail: 'Changes simulated identity only; no real permissions', insertText: 'setthreadidentity($1)' },
    { label: 'getgc', kind: 'function', signature: 'getgc(includeTables: boolean?): table', detail: 'Returns garbage-collected objects, when supported', insertText: 'getgc($1)' },
    { label: 'getconnections', kind: 'function', signature: 'getconnections(signal: RBXScriptSignal): table', detail: 'Lists connections on a signal, when supported', insertText: 'getconnections($1)' },
    { label: 'hookfunction', kind: 'function', signature: 'hookfunction(target: function, replacement: function): function', detail: 'Mock: returns original; does not hook calls', insertText: 'hookfunction($1, $2)' },
    { label: 'hookmetamethod', kind: 'function', signature: 'hookmetamethod(object: any, method: string, replacement: function): function', detail: 'Mock: does not hook Roblox metamethods', insertText: 'hookmetamethod($1, $2, $3)' },
    { label: 'queue_on_teleport', kind: 'function', signature: 'queue_on_teleport(source: string)', detail: 'Queues source across teleports, when supported', insertText: 'queue_on_teleport($1)' },
    { label: 'checkcaller', kind: 'function', signature: 'checkcaller(): boolean', detail: 'Checks caller context, when supported', insertText: 'checkcaller()' }
  ];

  const LIBRARIES = {
    Drawing: [
      { label: 'new', kind: 'function', detail: 'Create an in-memory Drawing object (no actual rendering)', insertText: 'new("$1")' },
      { label: 'Fonts', kind: 'property', detail: 'Mock Drawing font constants', insertText: 'Fonts' }
    ],
    bit: ['band','bor','bxor','bnot','lshift','rshift','arshift','rol','ror','tobit','badd','bsub','bmul','bdiv','bswap','tohex'].map(label=>({label,kind:'function',detail:'Mock bit32-based operation',insertText:label+'($1)'})),
    syn: [
      { label: 'protect_gui', kind: 'function', signature: 'syn.protect_gui(instance: Instance)', detail: 'Mock: validates an instance; does not protect it in Roblox', insertText: 'protect_gui($1)' },
      { label: 'unprotect_gui', kind: 'function', detail: 'Mock: validates an instance', insertText: 'unprotect_gui($1)' },
      { label: 'request', kind: 'function', detail: 'Real browser HTTP after permission; CORS applies', insertText: 'request($1)' },
      { label: 'queue_on_teleport', kind: 'function', detail: 'Mock: does not persist or run across teleports', insertText: 'queue_on_teleport($1)' }
    ],
    http: [{ label: 'request', kind: 'function', detail: 'Real browser HTTP after permission; CORS applies', insertText: 'request($1)' }],
    task: [
      { label: 'wait', kind: 'function', signature: 'task.wait(duration: number?): number', detail: 'Yields current coroutine until next Heartbeat or duration elapses', insertText: 'wait($1)' },
      { label: 'spawn', kind: 'function', signature: 'task.spawn(fnOrThread: function, ...: any): thread', detail: 'Immediately resumes function/coroutine via scheduler', insertText: 'spawn(function()\n\t$1\nend)' },
      { label: 'defer', kind: 'function', signature: 'task.defer(fnOrThread: function, ...: any): thread', detail: 'Schedules function/thread at end of current resumption cycle', insertText: 'defer(function()\n\t$1\nend)' },
      { label: 'delay', kind: 'function', signature: 'task.delay(duration: number, fn: function, ...: any): thread', detail: 'Schedules function to run after duration seconds', insertText: 'delay(${1:1}, function()\n\t$2\nend)' },
      { label: 'cancel', kind: 'function', signature: 'task.cancel(thread: thread)', detail: 'Cancels a scheduled or yielded thread', insertText: 'cancel($1)' },
      { label: 'synchronize', kind: 'function', signature: 'task.synchronize()', detail: 'Resumes serial execution phase (Parallel Luau)', insertText: 'synchronize()' },
      { label: 'desynchronize', kind: 'function', signature: 'task.desynchronize()', detail: 'Enters parallel execution phase (Parallel Luau)', insertText: 'desynchronize()' }
    ],
    math: [
      { label: 'abs', kind: 'function', signature: 'math.abs(x: number): number', detail: 'Absolute value of x', insertText: 'abs($1)' },
      { label: 'clamp', kind: 'function', signature: 'math.clamp(x: number, min: number, max: number): number', detail: 'Clamps x between min and max', insertText: 'clamp($1)' },
      { label: 'floor', kind: 'function', signature: 'math.floor(x: number): number', detail: 'Largest integer <= x', insertText: 'floor($1)' },
      { label: 'ceil', kind: 'function', signature: 'math.ceil(x: number): number', detail: 'Smallest integer >= x', insertText: 'ceil($1)' },
      { label: 'round', kind: 'function', signature: 'math.round(x: number): number', detail: 'Rounds x to nearest integer', insertText: 'round($1)' },
      { label: 'random', kind: 'function', signature: 'math.random(m: number?, n: number?): number', detail: 'Generates random float [0,1) or integer [m,n]', insertText: 'random($1)' },
      { label: 'randomseed', kind: 'function', signature: 'math.randomseed(seed: number)', detail: 'Sets seed for math.random', insertText: 'randomseed($1)' },
      { label: 'rad', kind: 'function', signature: 'math.rad(deg: number): number', detail: 'Converts degrees to radians', insertText: 'rad($1)' },
      { label: 'deg', kind: 'function', signature: 'math.deg(rad: number): number', detail: 'Converts radians to degrees', insertText: 'deg($1)' },
      { label: 'sin', kind: 'function', signature: 'math.sin(x: number): number', detail: 'Sine of x (radians)', insertText: 'sin($1)' },
      { label: 'cos', kind: 'function', signature: 'math.cos(x: number): number', detail: 'Cosine of x (radians)', insertText: 'cos($1)' },
      { label: 'tan', kind: 'function', signature: 'math.tan(x: number): number', detail: 'Tangent of x (radians)', insertText: 'tan($1)' },
      { label: 'asin', kind: 'function', signature: 'math.asin(x: number): number', detail: 'Arcsine of x', insertText: 'asin($1)' },
      { label: 'acos', kind: 'function', signature: 'math.acos(x: number): number', detail: 'Arccosine of x', insertText: 'acos($1)' },
      { label: 'atan2', kind: 'function', signature: 'math.atan2(y: number, x: number): number', detail: 'Arctangent of y/x using signs for quadrant', insertText: 'atan2($1)' },
      { label: 'sqrt', kind: 'function', signature: 'math.sqrt(x: number): number', detail: 'Square root of x', insertText: 'sqrt($1)' },
      { label: 'min', kind: 'function', signature: 'math.min(...: number): number', detail: 'Smallest argument', insertText: 'min($1)' },
      { label: 'max', kind: 'function', signature: 'math.max(...: number): number', detail: 'Largest argument', insertText: 'max($1)' },
      { label: 'noise', kind: 'function', signature: 'math.noise(x: number, y: number?, z: number?): number', detail: 'Perlin noise in [-0.5, 0.5]', insertText: 'noise($1)' },
      { label: 'sign', kind: 'function', signature: 'math.sign(x: number): number', detail: 'Returns -1, 0, or 1', insertText: 'sign($1)' },
      { label: 'lerp', kind: 'function', signature: 'math.lerp(a: number, b: number, t: number): number', detail: 'Linearly interpolates between a and b by t', insertText: 'lerp($1)' },
      { label: 'pi', kind: 'property', detail: '3.141592653589793', insertText: 'pi' },
      { label: 'huge', kind: 'property', detail: 'Infinity (math.huge)', insertText: 'huge' }
    ],
    string: [
      { label: 'format', kind: 'function', signature: 'string.format(fmt: string, ...: any): string', detail: 'Formats string printf-style (%s, %d, %.2f)', insertText: 'format($1)' },
      { label: 'sub', kind: 'function', signature: 'string.sub(s: string, i: number, j: number?): string', detail: 'Returns substring from i to j (1-based)', insertText: 'sub($1)' },
      { label: 'lower', kind: 'function', signature: 'string.lower(s: string): string', detail: 'Converts string to lowercase', insertText: 'lower($1)' },
      { label: 'upper', kind: 'function', signature: 'string.upper(s: string): string', detail: 'Converts string to uppercase', insertText: 'upper($1)' },
      { label: 'split', kind: 'function', signature: 'string.split(s: string, separator: string?): {string}', detail: 'Splits string into table array of parts', insertText: 'split($1)' },
      { label: 'find', kind: 'function', signature: 'string.find(s: string, pattern: string, init: number?, plain: boolean?)', detail: 'Finds first match start & end indices', insertText: 'find($1)' },
      { label: 'match', kind: 'function', signature: 'string.match(s: string, pattern: string, init: number?)', detail: 'Extracts pattern captures from string', insertText: 'match($1)' },
      { label: 'gsub', kind: 'function', signature: 'string.gsub(s: string, pattern: string, repl: any, n: number?)', detail: 'Global pattern substitution', insertText: 'gsub($1)' },
      { label: 'gmatch', kind: 'function', signature: 'string.gmatch(s: string, pattern: string): iterator', detail: 'Returns iterator over pattern matches', insertText: 'gmatch($1)' },
      { label: 'rep', kind: 'function', signature: 'string.rep(s: string, n: number): string', detail: 'Repeats string n times', insertText: 'rep($1)' },
      { label: 'reverse', kind: 'function', signature: 'string.reverse(s: string): string', detail: 'Reverses string', insertText: 'reverse($1)' },
      { label: 'byte', kind: 'function', signature: 'string.byte(s: string, i: number?, j: number?)', detail: 'Returns ASCII numeric codes', insertText: 'byte($1)' },
      { label: 'char', kind: 'function', signature: 'string.char(...: number): string', detail: 'Builds string from character byte codes', insertText: 'char($1)' },
      { label: 'len', kind: 'function', signature: 'string.len(s: string): number', detail: 'Returns string byte length', insertText: 'len($1)' }
    ],
    table: [
      { label: 'insert', kind: 'function', signature: 'table.insert(t: {T}, posOrValue: any, value: T?)', detail: 'Appends or inserts element into array table', insertText: 'insert($1)' },
      { label: 'remove', kind: 'function', signature: 'table.remove(t: {T}, pos: number?): T?', detail: 'Removes and returns element at pos (default #t)', insertText: 'remove($1)' },
      { label: 'find', kind: 'function', signature: 'table.find(haystack: {T}, needle: T, init: number?): number?', detail: 'Returns 1-based index of needle or nil', insertText: 'find($1)' },
      { label: 'sort', kind: 'function', signature: 'table.sort(t: {T}, comp: ((T, T) -> boolean)?)', detail: 'Sorts array elements in-place', insertText: 'sort($1)' },
      { label: 'concat', kind: 'function', signature: 'table.concat(t: {string|number}, sep: string?, i: number?, j: number?): string', detail: 'Joins array elements into string', insertText: 'concat($1)' },
      { label: 'clone', kind: 'function', signature: 'table.clone(t: table): table', detail: 'Creates shallow copy of table', insertText: 'clone($1)' },
      { label: 'clear', kind: 'function', signature: 'table.clear(t: table)', detail: 'Removes all keys from table while keeping capacity', insertText: 'clear($1)' },
      { label: 'create', kind: 'function', signature: 'table.create(count: number, value: T?): {T}', detail: 'Preallocates array table of size count', insertText: 'create($1)' },
      { label: 'freeze', kind: 'function', signature: 'table.freeze(t: table): table', detail: 'Makes table read-only immutable', insertText: 'freeze($1)' },
      { label: 'isfrozen', kind: 'function', signature: 'table.isfrozen(t: table): boolean', detail: 'Checks if table is frozen', insertText: 'isfrozen($1)' },
      { label: 'pack', kind: 'function', signature: 'table.pack(...: any): table', detail: 'Packs arguments into table with field n', insertText: 'pack($1)' },
      { label: 'unpack', kind: 'function', signature: 'table.unpack(list: table, i: number?, j: number?)', detail: 'Unpacks elements i..j', insertText: 'unpack($1)' }
    ],
    coroutine: [
      { label: 'create', kind: 'function', signature: 'coroutine.create(f: function): thread', detail: 'Creates new coroutine thread', insertText: 'create($1)' },
      { label: 'resume', kind: 'function', signature: 'coroutine.resume(co: thread, ...: any)', detail: 'Starts or continues coroutine execution', insertText: 'resume($1)' },
      { label: 'yield', kind: 'function', signature: 'coroutine.yield(...: any)', detail: 'Suspends running coroutine', insertText: 'yield($1)' },
      { label: 'wrap', kind: 'function', signature: 'coroutine.wrap(f: function): function', detail: 'Returns function that resumes new coroutine', insertText: 'wrap($1)' },
      { label: 'running', kind: 'function', signature: 'coroutine.running(): thread', detail: 'Returns currently running coroutine', insertText: 'running()' },
      { label: 'status', kind: 'function', signature: 'coroutine.status(co: thread): string', detail: 'Returns "running", "suspended", "normal", or "dead"', insertText: 'status($1)' }
    ],
    os: [
      { label: 'clock', kind: 'function', signature: 'os.clock(): number', detail: 'High-precision CPU time in seconds for benchmarking', insertText: 'clock()' },
      { label: 'time', kind: 'function', signature: 'os.time(t: table?): number', detail: 'UTC UNIX timestamp in seconds', insertText: 'time()' },
      { label: 'date', kind: 'function', signature: 'os.date(format: string?, time: number?)', detail: 'Formats date string or table', insertText: 'date($1)' },
      { label: 'difftime', kind: 'function', signature: 'os.difftime(t2: number, t1: number): number', detail: 'Difference t2 - t1 in seconds', insertText: 'difftime($1)' }
    ],
    bit32: [
      { label: 'band', kind: 'function', signature: 'bit32.band(...: number): number', detail: 'Bitwise AND', insertText: 'band($1)' },
      { label: 'bor', kind: 'function', signature: 'bit32.bor(...: number): number', detail: 'Bitwise OR', insertText: 'bor($1)' },
      { label: 'bxor', kind: 'function', signature: 'bit32.bxor(...: number): number', detail: 'Bitwise XOR', insertText: 'bxor($1)' },
      { label: 'bnot', kind: 'function', signature: 'bit32.bnot(x: number): number', detail: 'Bitwise NOT', insertText: 'bnot($1)' },
      { label: 'lshift', kind: 'function', signature: 'bit32.lshift(x: number, disp: number): number', detail: 'Logical left shift', insertText: 'lshift($1)' },
      { label: 'rshift', kind: 'function', signature: 'bit32.rshift(x: number, disp: number): number', detail: 'Logical right shift', insertText: 'rshift($1)' }
    ],
    debug: [
      { label: 'traceback', kind: 'function', signature: 'debug.traceback(message: string?, level: number?): string', detail: 'Returns call stack trace string', insertText: 'traceback($1)' },
      { label: 'profilebegin', kind: 'function', signature: 'debug.profilebegin(label: string)', detail: 'Opens MicroProfiler label scope', insertText: 'profilebegin($1)' },
      { label: 'profileend', kind: 'function', signature: 'debug.profileend()', detail: 'Closes MicroProfiler scope', insertText: 'profileend()' }
    ],
    Instance: [
      { label: 'new', kind: 'function', signature: 'Instance.new(className: string, parent: Instance?): Instance', detail: 'Creates a new Roblox Instance of given ClassName', insertText: 'new("$1")' },
      { label: 'fromExisting', kind: 'function', signature: 'Instance.fromExisting(existing: Instance): Instance', detail: 'Creates shallow copy keeping properties', insertText: 'fromExisting($1)' }
    ],
    Vector3: [
      { label: 'new', kind: 'function', signature: 'Vector3.new(x: number?, y: number?, z: number?): Vector3', detail: 'Constructs a 3D vector', insertText: 'new($1)' },
      { label: 'zero', kind: 'property', type: 'Vector3', detail: 'Vector3.new(0, 0, 0)', insertText: 'zero' },
      { label: 'one', kind: 'property', type: 'Vector3', detail: 'Vector3.new(1, 1, 1)', insertText: 'one' },
      { label: 'xAxis', kind: 'property', type: 'Vector3', detail: 'Vector3.new(1, 0, 0)', insertText: 'xAxis' },
      { label: 'yAxis', kind: 'property', type: 'Vector3', detail: 'Vector3.new(0, 1, 0)', insertText: 'yAxis' },
      { label: 'zAxis', kind: 'property', type: 'Vector3', detail: 'Vector3.new(0, 0, 1)', insertText: 'zAxis' }
    ],
    Vector2: [
      { label: 'new', kind: 'function', signature: 'Vector2.new(x: number?, y: number?): Vector2', detail: 'Constructs a 2D vector', insertText: 'new($1)' },
      { label: 'zero', kind: 'property', type: 'Vector2', detail: 'Vector2.new(0, 0)', insertText: 'zero' },
      { label: 'one', kind: 'property', type: 'Vector2', detail: 'Vector2.new(1, 1)', insertText: 'one' }
    ],
    CFrame: [
      { label: 'new', kind: 'function', signature: 'CFrame.new(x: number?, y: number?, z: number?): CFrame', detail: 'Creates a CFrame at position or looking at target', insertText: 'new($1)' },
      { label: 'Angles', kind: 'function', signature: 'CFrame.Angles(rx: number, ry: number, rz: number): CFrame', detail: 'Creates rotated CFrame from Euler angles in radians', insertText: 'Angles($1)' },
      { label: 'fromEulerAnglesXYZ', kind: 'function', signature: 'CFrame.fromEulerAnglesXYZ(rx, ry, rz): CFrame', detail: 'Creates rotated CFrame from XYZ angles in radians', insertText: 'fromEulerAnglesXYZ($1)' },
      { label: 'lookAt', kind: 'function', signature: 'CFrame.lookAt(at: Vector3, lookAt: Vector3, up: Vector3?): CFrame', detail: 'Creates CFrame at position oriented toward lookAt', insertText: 'lookAt($1)' },
      { label: 'identity', kind: 'property', type: 'CFrame', detail: 'Unrotated CFrame at origin (0, 0, 0)', insertText: 'identity' }
    ],
    Color3: [
      { label: 'fromRGB', kind: 'function', signature: 'Color3.fromRGB(r: number, g: number, b: number): Color3', detail: 'Creates Color3 from 0-255 RGB integers', insertText: 'fromRGB($1)' },
      { label: 'new', kind: 'function', signature: 'Color3.new(r: number?, g: number?, b: number?): Color3', detail: 'Creates Color3 from 0-1 normalized floats', insertText: 'new($1)' },
      { label: 'fromHSV', kind: 'function', signature: 'Color3.fromHSV(h: number, s: number, v: number): Color3', detail: 'Creates Color3 from Hue, Saturation, Value (0-1)', insertText: 'fromHSV($1)' },
      { label: 'fromHex', kind: 'function', signature: 'Color3.fromHex(hex: string): Color3', detail: 'Creates Color3 from hex string e.g. "#00A2FF"', insertText: 'fromHex("$1")' }
    ],
    BrickColor: [
      { label: 'new', kind: 'function', signature: 'BrickColor.new(name: string): BrickColor', detail: 'Creates BrickColor by name (e.g. "Bright red")', insertText: 'new("$1")' },
      { label: 'Random', kind: 'function', signature: 'BrickColor.Random(): BrickColor', detail: 'Returns random BrickColor from palette', insertText: 'Random()' },
      { label: 'Red', kind: 'function', signature: 'BrickColor.Red(): BrickColor', detail: 'Bright red BrickColor', insertText: 'Red()' },
      { label: 'Blue', kind: 'function', signature: 'BrickColor.Blue(): BrickColor', detail: 'Bright blue BrickColor', insertText: 'Blue()' },
      { label: 'Green', kind: 'function', signature: 'BrickColor.Green(): BrickColor', detail: 'Bright green BrickColor', insertText: 'Green()' },
      { label: 'Yellow', kind: 'function', signature: 'BrickColor.Yellow(): BrickColor', detail: 'Bright yellow BrickColor', insertText: 'Yellow()' },
      { label: 'White', kind: 'function', signature: 'BrickColor.White(): BrickColor', detail: 'White BrickColor', insertText: 'White()' }
    ],
    UDim2: [
      { label: 'new', kind: 'function', signature: 'UDim2.new(xScale, xOffset, yScale, yOffset): UDim2', detail: 'Constructs 2D UI size/position', insertText: 'new($1)' },
      { label: 'fromScale', kind: 'function', signature: 'UDim2.fromScale(xScale: number, yScale: number): UDim2', detail: 'Creates UDim2 using pure scale (0..1)', insertText: 'fromScale($1)' },
      { label: 'fromOffset', kind: 'function', signature: 'UDim2.fromOffset(xOffset: number, yOffset: number): UDim2', detail: 'Creates UDim2 using pixel offsets', insertText: 'fromOffset($1)' }
    ],
    UDim: [
      { label: 'new', kind: 'function', signature: 'UDim.new(scale: number, offset: number): UDim', detail: 'Constructs 1D UI coordinate', insertText: 'new($1)' }
    ],
    TweenInfo: [
      { label: 'new', kind: 'function', signature: 'TweenInfo.new(time?, easingStyle?, easingDirection?, repeatCount?, reverses?, delayTime?)', detail: 'Creates animation config for TweenService:Create()', insertText: 'new($1)' }
    ],
    RaycastParams: [
      { label: 'new', kind: 'function', signature: 'RaycastParams.new(): RaycastParams', detail: 'Creates RaycastParams filter configuration', insertText: 'new()' }
    ],
    OverlapParams: [
      { label: 'new', kind: 'function', signature: 'OverlapParams.new(): OverlapParams', detail: 'Creates OverlapParams query configuration', insertText: 'new()' }
    ],
    Random: [
      { label: 'new', kind: 'function', signature: 'Random.new(seed: number?): Random', detail: 'Creates isolated Random generator instance', insertText: 'new($1)' }
    ],
    DateTime: [
      { label: 'now', kind: 'function', signature: 'DateTime.now(): DateTime', detail: 'Current UTC DateTime object', insertText: 'now()' },
      { label: 'fromUnixTimestamp', kind: 'function', signature: 'DateTime.fromUnixTimestamp(unixTimestamp: number): DateTime', detail: 'Creates DateTime from seconds', insertText: 'fromUnixTimestamp($1)' }
    ],
    NumberRange: [
      { label: 'new', kind: 'function', signature: 'NumberRange.new(min: number, max: number?): NumberRange', detail: 'Creates range between min and max', insertText: 'new($1)' }
    ]
  };

  const ENUMS = {
    KeyCode: ['W', 'A', 'S', 'D', 'Space', 'E', 'F', 'Q', 'R', 'G', 'H', 'C', 'V', 'X', 'Z', 'LeftShift', 'RightShift', 'LeftControl', 'LeftAlt', 'Tab', 'Return', 'Backspace', 'Escape', 'One', 'Two', 'Three', 'Four', 'Up', 'Down', 'Left', 'Right', 'ButtonA', 'ButtonB', 'ButtonX', 'ButtonY'],
    Material: ['Plastic', 'SmoothPlastic', 'Neon', 'Glass', 'ForceField', 'Metal', 'DiamondPlate', 'CorrodedMetal', 'Foil', 'Wood', 'WoodPlanks', 'Marble', 'Granite', 'Brick', 'Slate', 'Concrete', 'Grass', 'Sand', 'Ice', 'Snow', 'CrackedLava', 'Basalt', 'Fabric', 'Water'],
    PartType: ['Block', 'Ball', 'Cylinder', 'Wedge', 'CornerWedge'],
    EasingStyle: ['Linear', 'Sine', 'Quad', 'Cubic', 'Quart', 'Quint', 'Back', 'Bounce', 'Elastic', 'Exponential', 'Circular'],
    EasingDirection: ['In', 'Out', 'InOut'],
    UserInputType: ['MouseButton1', 'MouseButton2', 'MouseButton3', 'MouseMovement', 'MouseWheel', 'Touch', 'Keyboard', 'Gamepad1'],
    HumanoidStateType: ['Jumping', 'Freefall', 'Landed', 'Running', 'Swimming', 'Climbing', 'Seated', 'Dead', 'Physics'],
    RaycastFilterType: ['Exclude', 'Include', 'Blacklist', 'Whitelist'],
    Font: ['Gotham', 'GothamBold', 'GothamBlack', 'BuilderSans', 'BuilderSansBold', 'RobotoMono', 'SourceSans', 'SourceSansBold', 'FredokaOne', 'Bangers', 'Code'],
    CameraType: ['Custom', 'Scriptable', 'Fixed', 'Follow', 'Watch', 'Orbital'],
    ProximityPromptExclusivity: ['OnePerButton', 'OneGlobally', 'AlwaysShow'],
    NormalId: ['Top', 'Bottom', 'Left', 'Right', 'Front', 'Back']
  };

  const SERVICES = [
    { name: 'Workspace', detail: '3D world container simulating physics & rendering parts' },
    { name: 'Players', detail: 'Manages connected Player instances, LocalPlayer & leaderstats' },
    { name: 'ReplicatedStorage', detail: 'Shared container accessible by both Server and Client' },
    { name: 'ServerScriptService', detail: 'Server-only container for running server Scripts', serverOnly: true },
    { name: 'ServerStorage', detail: 'Server-only storage hidden from clients', serverOnly: true },
    { name: 'StarterGui', detail: 'Template ScreenGuis cloned into each PlayerGui' },
    { name: 'StarterPack', detail: 'Tools cloned into each player Backpack on spawn' },
    { name: 'StarterPlayer', detail: 'Contains StarterPlayerScripts & StarterCharacterScripts' },
    { name: 'ReplicatedFirst', detail: 'Replicates to clients before anything else for loading screens' },
    { name: 'Lighting', detail: 'Controls skybox, ClockTime, Brightness, Ambient & Atmosphere' },
    { name: 'TweenService', detail: 'Smoothly interpolates Instance properties over time' },
    { name: 'RunService', detail: 'Frame-by-frame events (Heartbeat, RenderStepped, Stepped)' },
    { name: 'UserInputService', detail: 'Captures keyboard, mouse, touch, and gamepad inputs' },
    { name: 'ContextActionService', detail: 'Binds contextual inputs & mobile touch buttons' },
    { name: 'DataStoreService', detail: 'Persistent cloud key-value data storage (Server only)', serverOnly: true },
    { name: 'CollectionService', detail: 'Manages string tags across Instances for entity systems' },
    { name: 'HttpService', detail: 'JSON encode/decode, GUID generation, and HTTP requests' },
    { name: 'SoundService', detail: 'Global audio settings and playback control' },
    { name: 'Debris', detail: 'Schedules automatic Instance cleanup after a lifetime' },
    { name: 'MarketplaceService', detail: 'Handles GamePasses, Developer Products, and purchases' },
    { name: 'ProximityPromptService', detail: 'Global events for all 3D ProximityPrompts' },
    { name: 'PathfindingService', detail: 'Computes navigation waypoints around 3D obstacles' },
    { name: 'TeleportService', detail: 'Teleports players between places and servers' },
    { name: 'Teams', detail: 'Manages player Team assignments and spawn colors' },
    { name: 'BadgeService', detail: 'Awards and queries player badges' },
    { name: 'TextChatService', detail: 'Modern Roblox in-experience chat system' }
  ];

  const CREATABLE_CLASSES = [
    { name: 'Part', icon: 'part', detail: '3D physical building block in Workspace' },
    { name: 'SpawnLocation', icon: 'spawn', detail: 'Part where player characters spawn' },
    { name: 'Model', icon: 'model', detail: 'Container grouping 3D BaseParts (PrimaryPart, PivotTo)' },
    { name: 'Folder', icon: 'folder', detail: 'Organizational container for Instances' },
    { name: 'Script', icon: 'script', detail: 'Server-side Luau script' },
    { name: 'LocalScript', icon: 'localscript', detail: 'Client-side Luau script' },
    { name: 'ModuleScript', icon: 'modulescript', detail: 'Reusable module loaded via require()' },
    { name: 'RemoteEvent', icon: 'remote', detail: 'Asynchronous two-way Client <-> Server event' },
    { name: 'RemoteFunction', icon: 'remotefn', detail: 'Synchronous yielding Client <-> Server RPC' },
    { name: 'BindableEvent', icon: 'bindable', detail: 'Same-boundary custom event dispatcher' },
    { name: 'IntValue', icon: 'value', detail: 'Stores an integer .Value (ideal for leaderstats)' },
    { name: 'NumberValue', icon: 'value', detail: 'Stores a floating-point .Value' },
    { name: 'StringValue', icon: 'value', detail: 'Stores a string .Value' },
    { name: 'BoolValue', icon: 'value', detail: 'Stores a boolean .Value' },
    { name: 'ObjectValue', icon: 'value', detail: 'Stores an Instance reference .Value' },
    { name: 'ClickDetector', icon: 'click', detail: 'Allows clicking a BasePart (MouseClick)' },
    { name: 'ProximityPrompt', icon: 'prompt', detail: 'In-world [E] interaction prompt (Triggered)' },
    { name: 'Highlight', icon: 'effect', detail: 'Renders outline & fill glow on a Part or Model' },
    { name: 'PointLight', icon: 'light', detail: 'Omnidirectional light source' },
    { name: 'ParticleEmitter', icon: 'effect', detail: 'Emits 2D particles in 3D space' },
    { name: 'Sound', icon: 'sound', detail: 'Audio emitter (:Play(), :Stop(), SoundId, Volume)' },
    { name: 'ScreenGui', icon: 'gui', detail: '2D UI container rendered on player screen' },
    { name: 'Frame', icon: 'frame', detail: '2D rectangular UI container' },
    { name: 'TextLabel', icon: 'label', detail: '2D UI non-interactive text display' },
    { name: 'TextButton', icon: 'button', detail: '2D UI interactive clickable button (MouseButton1Click)' },
    { name: 'TextBox', icon: 'textbox', detail: '2D UI text input field' },
    { name: 'UICorner', icon: 'ui', detail: 'Rounds corners of parent GuiObject' },
    { name: 'UIStroke', icon: 'ui', detail: 'Adds outline border to parent GuiObject or text' },
    { name: 'Humanoid', icon: 'humanoid', detail: 'Controls Character Health, WalkSpeed & JumpPower' },
    { name: 'Tool', icon: 'tool', detail: 'Equippable item in Backpack/Character (.Activated)' },
    { name: 'Attachment', icon: 'part', detail: '3D point offset relative to parent BasePart' },
    { name: 'WeldConstraint', icon: 'part', detail: 'Locks two BaseParts rigidly together (Part0, Part1)' }
  ];

  // Inheritance hierarchy & member descriptors for accurate IntelliSense on `.` vs `:`
  const CLASS_DEFS = {
    Instance: {
      super: null,
      properties: [
        { label: 'Name', type: 'string', detail: 'Non-unique identifier of this Instance' },
        { label: 'ClassName', type: 'string', detail: 'Read-only class type name' },
        { label: 'Parent', type: 'Instance?', detail: 'Hierarchical parent container in DataModel' },
        { label: 'Archivable', type: 'boolean', detail: 'Whether Clone() and saving include this Instance' }
      ],
      methods: [
        { label: 'FindFirstChild', signature: ':FindFirstChild(name: string, recursive: boolean?): Instance?', detail: 'Returns first child matching Name or nil', insertText: 'FindFirstChild("$1")' },
        { label: 'FindFirstChildOfClass', signature: ':FindFirstChildOfClass(className: string): Instance?', detail: 'Returns first child whose ClassName matches', insertText: 'FindFirstChildOfClass("$1")' },
        { label: 'FindFirstChildWhichIsA', signature: ':FindFirstChildWhichIsA(className: string): Instance?', detail: 'Returns first child inheriting from className', insertText: 'FindFirstChildWhichIsA("$1")' },
        { label: 'WaitForChild', signature: ':WaitForChild(name: string, timeOut: number?): Instance?', detail: 'Yields until a child with given Name exists', insertText: 'WaitForChild("$1")' },
        { label: 'GetChildren', signature: ':GetChildren(): {Instance}', detail: 'Returns array of direct child Instances', insertText: 'GetChildren()' },
        { label: 'GetDescendants', signature: ':GetDescendants(): {Instance}', detail: 'Returns array of all recursive descendants', insertText: 'GetDescendants()' },
        { label: 'IsA', signature: ':IsA(className: string): boolean', detail: 'Checks if Instance is or inherits from className', insertText: 'IsA("$1")' },
        { label: 'IsDescendantOf', signature: ':IsDescendantOf(ancestor: Instance): boolean', detail: 'True if inside ancestor hierarchy', insertText: 'IsDescendantOf($1)' },
        { label: 'Clone', signature: ':Clone(): Instance', detail: 'Deep copies this Instance and its descendants', insertText: 'Clone()' },
        { label: 'Destroy', signature: ':Destroy()', detail: 'Parents to nil, disconnects all events, and locks Parent', insertText: 'Destroy()' },
        { label: 'ClearAllChildren', signature: ':ClearAllChildren()', detail: 'Destroys all child Instances', insertText: 'ClearAllChildren()' },
        { label: 'GetFullName', signature: ':GetFullName(): string', detail: 'Returns dot-separated DataModel path', insertText: 'GetFullName()' },
        { label: 'SetAttribute', signature: ':SetAttribute(attribute: string, value: any)', detail: 'Sets custom attribute on Instance', insertText: 'SetAttribute("$1", $2)' },
        { label: 'GetAttribute', signature: ':GetAttribute(attribute: string): any', detail: 'Reads custom attribute value', insertText: 'GetAttribute("$1")' },
        { label: 'GetAttributes', signature: ':GetAttributes(): {[string]: any}', detail: 'Returns dictionary of all attributes', insertText: 'GetAttributes()' },
        { label: 'GetPropertyChangedSignal', signature: ':GetPropertyChangedSignal(property: string): RBXScriptSignal', detail: 'Fires when specific property changes', insertText: 'GetPropertyChangedSignal("$1")' },
        { label: 'GetAttributeChangedSignal', signature: ':GetAttributeChangedSignal(attribute: string): RBXScriptSignal', detail: 'Fires when specific attribute changes', insertText: 'GetAttributeChangedSignal("$1")' }
      ],
      events: [
        { label: 'ChildAdded', detail: 'Fires when a child is parented to this Instance (child: Instance)' },
        { label: 'ChildRemoved', detail: 'Fires when a child leaves this Instance (child: Instance)' },
        { label: 'DescendantAdded', detail: 'Fires when a descendant is added anywhere below' },
        { label: 'Changed', detail: 'Fires when any property changes (propertyName: string)' },
        { label: 'Destroying', detail: 'Fires right before Instance:Destroy() completes' }
      ]
    },
    DataModel: {
      super: 'Instance',
      properties: [
        { label: 'PlaceId', type: 'number', detail: 'Unique ID of the current place' },
        { label: 'GameId', type: 'number', detail: 'Universe ID of the experience' },
        { label: 'CreatorId', type: 'number', detail: 'User/Group ID of place creator' },
        { label: 'JobId', type: 'string', detail: 'UUID of running server instance' }
      ],
      methods: [
        { label: 'GetService', signature: ':GetService(serviceName: string): Instance', detail: 'Retrieves or initializes a Roblox Service by name', insertText: 'GetService("$1")' },
        { label: 'HttpGet', signature: ':HttpGet(url: string): string', detail: 'Browser GET after permission; CORS applies', insertText: 'HttpGet("$1")' },
        { label: 'HttpPost', signature: ':HttpPost(url: string, data: string): string', detail: 'Browser POST after permission; CORS applies', insertText: 'HttpPost("$1", $2)' },
        { label: 'BindToClose', signature: ':BindToClose(callback: () -> ())', detail: 'Registers function to run before server shuts down', insertText: 'BindToClose(function()\n\t$1\nend)' }
      ],
      events: []
    },
    PVInstance: {
      super: 'Instance',
      properties: [],
      methods: [
        { label: 'GetPivot', signature: ':GetPivot(): CFrame', detail: 'Returns world CFrame pivot of BasePart or Model', insertText: 'GetPivot()' },
        { label: 'PivotTo', signature: ':PivotTo(targetCFrame: CFrame)', detail: 'Moves BasePart or entire Model cleanly to targetCFrame', insertText: 'PivotTo($1)' }
      ],
      events: []
    },
    BasePart: {
      super: 'PVInstance',
      properties: [
        { label: 'Position', type: 'Vector3', detail: '3D world coordinates of part center' },
        { label: 'Size', type: 'Vector3', detail: '3D dimensions in studs (X, Y, Z)' },
        { label: 'CFrame', type: 'CFrame', detail: '3D position and rotation matrix' },
        { label: 'Orientation', type: 'Vector3', detail: 'Euler rotation in degrees (X, Y, Z)' },
        { label: 'Color', type: 'Color3', detail: 'RGB surface color of the part' },
        { label: 'BrickColor', type: 'BrickColor', detail: 'BrickColor palette color of the part' },
        { label: 'Material', type: 'Enum.Material', detail: 'Surface material (Plastic, Neon, Glass, ...)' },
        { label: 'Transparency', type: 'number', detail: 'Opacity from 0 (opaque) to 1 (invisible)' },
        { label: 'Reflectance', type: 'number', detail: 'Skybox reflection factor (0 to 1)' },
        { label: 'Anchored', type: 'boolean', detail: 'If true, part is locked in space and unaffected by gravity' },
        { label: 'CanCollide', type: 'boolean', detail: 'Whether physical collisions occur with other parts' },
        { label: 'CanTouch', type: 'boolean', detail: 'Whether Touched / TouchEnded events fire' },
        { label: 'CanQuery', type: 'boolean', detail: 'Whether Raycast & spatial queries hit this part' },
        { label: 'CastShadow', type: 'boolean', detail: 'Whether part casts lighting shadows' },
        { label: 'Massless', type: 'boolean', detail: 'Excludes mass when welded to assembly' },
        { label: 'AssemblyLinearVelocity', type: 'Vector3', detail: 'Linear velocity of physics assembly' },
        { label: 'AssemblyAngularVelocity', type: 'Vector3', detail: 'Angular velocity of physics assembly' }
      ],
      methods: [
        { label: 'ApplyImpulse', signature: ':ApplyImpulse(impulse: Vector3)', detail: 'Applies instantaneous physics impulse', insertText: 'ApplyImpulse($1)' },
        { label: 'GetTouchingParts', signature: ':GetTouchingParts(): {BasePart}', detail: 'Returns parts physically intersecting this part', insertText: 'GetTouchingParts()' }
      ],
      events: [
        { label: 'Touched', detail: 'Fires when another BasePart touches this part (otherPart: BasePart)' },
        { label: 'TouchEnded', detail: 'Fires when touching BasePart stops intersecting (otherPart: BasePart)' }
      ]
    },
    Part: {
      super: 'BasePart',
      properties: [
        { label: 'Shape', type: 'Enum.PartType', detail: 'Block, Ball, Cylinder, Wedge, or CornerWedge' }
      ],
      methods: [],
      events: []
    },
    SpawnLocation: {
      super: 'Part',
      properties: [
        { label: 'Neutral', type: 'boolean', detail: 'Allows any player without team to spawn here' },
        { label: 'TeamColor', type: 'BrickColor', detail: 'Team color linked to this spawn' }
      ],
      methods: [],
      events: []
    },
    Model: {
      super: 'PVInstance',
      properties: [
        { label: 'PrimaryPart', type: 'BasePart?', detail: 'Reference part used as basis for Model transforms' }
      ],
      methods: [
        { label: 'GetBoundingBox', signature: ':GetBoundingBox(): (CFrame, Vector3)', detail: 'Returns orientation CFrame and size Vector3', insertText: 'GetBoundingBox()' },
        { label: 'GetExtentsSize', signature: ':GetExtentsSize(): Vector3', detail: 'Returns axis-aligned bounding size', insertText: 'GetExtentsSize()' },
        { label: 'MoveTo', signature: ':MoveTo(position: Vector3)', detail: 'Moves PrimaryPart avoiding obstructions', insertText: 'MoveTo($1)' }
      ],
      events: []
    },
    Workspace: {
      super: 'Model',
      properties: [
        { label: 'Gravity', type: 'number', detail: 'World downward acceleration in studs/s² (default 196.2)' },
        { label: 'CurrentCamera', type: 'Camera', detail: 'Active viewport Camera instance' },
        { label: 'FallenPartsDestroyHeight', type: 'number', detail: 'Y height below which parts auto-destroy (-500)' }
      ],
      methods: [
        { label: 'Raycast', signature: ':Raycast(origin: Vector3, direction: Vector3, params: RaycastParams?): RaycastResult?', detail: 'Casts 3D ray and returns hit Instance, Position, Normal, Material', insertText: 'Raycast($1, $2)' },
        { label: 'GetPartBoundsInBox', signature: ':GetPartBoundsInBox(cframe: CFrame, size: Vector3, params: OverlapParams?): {BasePart}', detail: 'Returns parts overlapping oriented 3D box', insertText: 'GetPartBoundsInBox($1, $2)' },
        { label: 'GetPartBoundsInRadius', signature: ':GetPartBoundsInRadius(position: Vector3, radius: number, params: OverlapParams?): {BasePart}', detail: 'Returns parts within radius studs', insertText: 'GetPartBoundsInRadius($1, $2)' },
        { label: 'GetServerTimeNow', signature: ':GetServerTimeNow(): number', detail: 'Synchronized high-precision server clock', insertText: 'GetServerTimeNow()' }
      ],
      events: []
    },
    Players: {
      super: 'Instance',
      properties: [
        { label: 'LocalPlayer', type: 'Player?', detail: 'Client-only reference to the local Player (nil on Server!)' },
        { label: 'MaxPlayers', type: 'number', detail: 'Maximum players per server instance' },
        { label: 'RespawnTime', type: 'number', detail: 'Seconds before Character respawns after death (default 5)' },
        { label: 'CharacterAutoLoads', type: 'boolean', detail: 'Whether Characters spawn automatically on join' }
      ],
      methods: [
        { label: 'GetPlayers', signature: ':GetPlayers(): {Player}', detail: 'Returns array of all connected Player instances', insertText: 'GetPlayers()' },
        { label: 'GetPlayerFromCharacter', signature: ':GetPlayerFromCharacter(character: Model): Player?', detail: 'Finds Player owning the given Character Model', insertText: 'GetPlayerFromCharacter($1)' },
        { label: 'GetPlayerByUserId', signature: ':GetPlayerByUserId(userId: number): Player?', detail: 'Finds connected Player matching UserId', insertText: 'GetPlayerByUserId($1)' }
      ],
      events: [
        { label: 'PlayerAdded', detail: 'Fires when a player joins the experience (player: Player)' },
        { label: 'PlayerRemoving', detail: 'Fires right before a player leaves (player: Player)' }
      ]
    },
    Player: {
      super: 'Instance',
      properties: [
        { label: 'UserId', type: 'number', detail: 'Unique permanent Roblox account ID' },
        { label: 'DisplayName', type: 'string', detail: 'Player non-unique display name' },
        { label: 'Character', type: 'Model?', detail: '3D Avatar Model in Workspace' },
        { label: 'leaderstats', type: 'Folder?', detail: 'Folder of ValueBases displayed on Leaderboard' },
        { label: 'PlayerGui', type: 'PlayerGui', detail: 'Container rendering ScreenGuis for this player' },
        { label: 'Backpack', type: 'Backpack', detail: 'Container holding unequipped Tool instances' },
        { label: 'Team', type: 'Team?', detail: 'Assigned Team instance' }
      ],
      methods: [
        { label: 'Kick', signature: ':Kick(message: string?)', detail: 'Disconnects player from server with message', insertText: 'Kick("$1")' },
        { label: 'LoadCharacter', signature: ':LoadCharacter()', detail: 'Spawns or resets the player Character', insertText: 'LoadCharacter()' },
        { label: 'DistanceFromCharacter', signature: ':DistanceFromCharacter(point: Vector3): number', detail: 'Distance in studs from Character head/root to point', insertText: 'DistanceFromCharacter($1)' }
      ],
      events: [
        { label: 'CharacterAdded', detail: 'Fires every time player Character spawns (character: Model)' },
        { label: 'CharacterRemoving', detail: 'Fires right before Character is removed' },
        { label: 'Chatted', detail: 'Fires when player sends a chat message (message: string)' }
      ]
    },
    Humanoid: {
      super: 'Instance',
      properties: [
        { label: 'Health', type: 'number', detail: 'Current health points (0 = Dead)' },
        { label: 'MaxHealth', type: 'number', detail: 'Maximum health capacity (default 100)' },
        { label: 'WalkSpeed', type: 'number', detail: 'Movement speed in studs/sec (default 16)' },
        { label: 'JumpPower', type: 'number', detail: 'Upward jump impulse power (default 50)' },
        { label: 'JumpHeight', type: 'number', detail: 'Target jump height in studs (default 7.2)' },
        { label: 'MoveDirection', type: 'Vector3', detail: 'Normalized world movement input vector' },
        { label: 'FloorMaterial', type: 'Enum.Material', detail: 'Material currently stood upon (Air when jumping)' }
      ],
      methods: [
        { label: 'TakeDamage', signature: ':TakeDamage(amount: number)', detail: 'Reduces Health respecting ForceFields', insertText: 'TakeDamage($1)' },
        { label: 'MoveTo', signature: ':MoveTo(location: Vector3, part: BasePart?)', detail: 'Walks character toward target location', insertText: 'MoveTo($1)' },
        { label: 'ChangeState', signature: ':ChangeState(state: Enum.HumanoidStateType)', detail: 'Transitions Humanoid physics state', insertText: 'ChangeState($1)' },
        { label: 'GetState', signature: ':GetState(): Enum.HumanoidStateType', detail: 'Returns active HumanoidStateType', insertText: 'GetState()' }
      ],
      events: [
        { label: 'Died', detail: 'Fires when Humanoid Health reaches 0' },
        { label: 'HealthChanged', detail: 'Fires when Health changes (health: number)' },
        { label: 'Running', detail: 'Fires when running speed changes (speed: number)' },
        { label: 'MoveToFinished', detail: 'Fires when :MoveTo() reaches goal or times out (reached: boolean)' }
      ]
    },
    TweenService: {
      super: 'Instance',
      properties: [],
      methods: [
        { label: 'Create', signature: ':Create(instance: Instance, tweenInfo: TweenInfo, propertyTable: {[string]: any}): Tween', detail: 'Creates smooth property animation Tween', insertText: 'Create($1, TweenInfo.new(${2:1}), {\n\t$3\n})' },
        { label: 'GetValue', signature: ':GetValue(alpha: number, easingStyle: Enum.EasingStyle, easingDirection: Enum.EasingDirection): number', detail: 'Computes eased alpha curve value', insertText: 'GetValue($1)' }
      ],
      events: []
    },
    Tween: {
      super: 'Instance',
      properties: [
        { label: 'PlaybackState', type: 'string', detail: 'Current state of the tween' }
      ],
      methods: [
        { label: 'Play', signature: ':Play()', detail: 'Starts playing the Tween animation', insertText: 'Play()' },
        { label: 'Pause', signature: ':Pause()', detail: 'Pauses Tween at current progress', insertText: 'Pause()' },
        { label: 'Cancel', signature: ':Cancel()', detail: 'Stops Tween and resets state', insertText: 'Cancel()' }
      ],
      events: [
        { label: 'Completed', detail: 'Fires when Tween finishes or cancels (playbackState)' }
      ]
    },
    RunService: {
      super: 'Instance',
      properties: [],
      methods: [
        { label: 'IsClient', signature: ':IsClient(): boolean', detail: 'Returns true if executing in client context', insertText: 'IsClient()' },
        { label: 'IsServer', signature: ':IsServer(): boolean', detail: 'Returns true if executing in server context', insertText: 'IsServer()' },
        { label: 'IsStudio', signature: ':IsStudio(): boolean', detail: 'Returns true when running in Roblox Studio', insertText: 'IsStudio()' },
        { label: 'IsRunning', signature: ':IsRunning(): boolean', detail: 'Returns true when simulation is active', insertText: 'IsRunning()' },
        { label: 'BindToRenderStep', signature: ':BindToRenderStep(name: string, priority: number, fn: (dt: number) -> ())', detail: 'Binds callback each frame at priority', insertText: 'BindToRenderStep("$1", ${2:200}, function(dt)\n\t$3\nend)' },
        { label: 'UnbindFromRenderStep', signature: ':UnbindFromRenderStep(name: string)', detail: 'Unbinds named render step callback', insertText: 'UnbindFromRenderStep("$1")' }
      ],
      events: [
        { label: 'Heartbeat', detail: 'Fires every frame after physics simulation (deltaTime: number)' },
        { label: 'RenderStepped', detail: 'Client-only: fires every frame prior to rendering (deltaTime: number)' },
        { label: 'Stepped', detail: 'Fires every frame prior to physics step (time: number, deltaTime: number)' }
      ]
    },
    UserInputService: {
      super: 'Instance',
      properties: [
        { label: 'TouchEnabled', type: 'boolean', detail: 'True if device has touch screen' },
        { label: 'KeyboardEnabled', type: 'boolean', detail: 'True if hardware keyboard is available' },
        { label: 'GamepadEnabled', type: 'boolean', detail: 'True if controller is connected' },
        { label: 'MouseBehavior', type: 'string', detail: 'Controls cursor lock state' }
      ],
      methods: [
        { label: 'IsKeyDown', signature: ':IsKeyDown(keyCode: Enum.KeyCode): boolean', detail: 'Checks if keyboard key is currently held down', insertText: 'IsKeyDown(Enum.KeyCode.$1)' },
        { label: 'GetMouseLocation', signature: ':GetMouseLocation(): Vector2', detail: 'Returns 2D screen coordinates of pointer', insertText: 'GetMouseLocation()' },
        { label: 'GetFocusedTextBox', signature: ':GetFocusedTextBox(): TextBox?', detail: 'Returns currently focused UI TextBox or nil', insertText: 'GetFocusedTextBox()' }
      ],
      events: [
        { label: 'InputBegan', detail: 'Fires when key/touch/click starts (input: InputObject, gameProcessedEvent: boolean)' },
        { label: 'InputEnded', detail: 'Fires when key/touch/click ends (input: InputObject, gameProcessedEvent: boolean)' },
        { label: 'InputChanged', detail: 'Fires when mouse/touch moves (input: InputObject, gameProcessedEvent: boolean)' },
        { label: 'JumpRequest', detail: 'Fires when player requests jump on keyboard/touch/gamepad' }
      ]
    },
    DataStoreService: {
      super: 'Instance',
      properties: [],
      methods: [
        { label: 'GetDataStore', signature: ':GetDataStore(name: string, scope: string?): GlobalDataStore', detail: 'Returns persistent DataStore object by name', insertText: 'GetDataStore("$1")' },
        { label: 'GetOrderedDataStore', signature: ':GetOrderedDataStore(name: string, scope: string?): OrderedDataStore', detail: 'Returns sorted integer leaderboard DataStore', insertText: 'GetOrderedDataStore("$1")' }
      ],
      events: []
    },
    GlobalDataStore: {
      super: 'Instance',
      properties: [],
      methods: [
        { label: 'GetAsync', signature: ':GetAsync(key: string): any', detail: 'Reads stored value for key', insertText: 'GetAsync($1)' },
        { label: 'SetAsync', signature: ':SetAsync(key: string, value: any)', detail: 'Saves value under key', insertText: 'SetAsync($1, $2)' },
        { label: 'UpdateAsync', signature: ':UpdateAsync(key: string, transformFunc: (old: any) -> any): any', detail: 'Atomically updates stored key value', insertText: 'UpdateAsync($1, function(oldValue)\n\treturn $2\nend)' },
        { label: 'IncrementAsync', signature: ':IncrementAsync(key: string, delta: number?): number', detail: 'Atomically increments stored integer', insertText: 'IncrementAsync($1, ${2:1})' },
        { label: 'RemoveAsync', signature: ':RemoveAsync(key: string): any', detail: 'Deletes key and returns prior value', insertText: 'RemoveAsync($1)' }
      ],
      events: []
    },
    CollectionService: {
      super: 'Instance',
      properties: [],
      methods: [
        { label: 'AddTag', signature: ':AddTag(instance: Instance, tag: string)', detail: 'Assigns string tag to Instance', insertText: 'AddTag($1, "$2")' },
        { label: 'RemoveTag', signature: ':RemoveTag(instance: Instance, tag: string)', detail: 'Removes string tag from Instance', insertText: 'RemoveTag($1, "$2")' },
        { label: 'HasTag', signature: ':HasTag(instance: Instance, tag: string): boolean', detail: 'Checks whether Instance has tag', insertText: 'HasTag($1, "$2")' },
        { label: 'GetTagged', signature: ':GetTagged(tag: string): {Instance}', detail: 'Returns all Instances with given tag', insertText: 'GetTagged("$1")' },
        { label: 'GetInstanceAddedSignal', signature: ':GetInstanceAddedSignal(tag: string): RBXScriptSignal', detail: 'Fires when tag is added to an Instance', insertText: 'GetInstanceAddedSignal("$1")' },
        { label: 'GetInstanceRemovedSignal', signature: ':GetInstanceRemovedSignal(tag: string): RBXScriptSignal', detail: 'Fires when tag is removed from an Instance', insertText: 'GetInstanceRemovedSignal("$1")' }
      ],
      events: []
    },
    HttpService: {
      super: 'Instance',
      properties: [],
      methods: [
        { label: 'GetAsync', signature: ':GetAsync(url: string): string', detail: 'Browser GET after permission; CORS applies', insertText: 'GetAsync("$1")' },
        { label: 'PostAsync', signature: ':PostAsync(url: string, data: string): string', detail: 'Browser POST after permission; CORS applies', insertText: 'PostAsync("$1", $2)' },
        { label: 'RequestAsync', signature: ':RequestAsync(options: table): table', detail: 'Real browser request after permission; CORS applies', insertText: 'RequestAsync($1)' },
        { label: 'JSONEncode', signature: ':JSONEncode(input: any): string', detail: 'Serializes Luau table/value into JSON string', insertText: 'JSONEncode($1)' },
        { label: 'JSONDecode', signature: ':JSONDecode(input: string): any', detail: 'Parses JSON string into Luau table', insertText: 'JSONDecode($1)' },
        { label: 'GenerateGUID', signature: ':GenerateGUID(wrapInCurlyBraces: boolean?): string', detail: 'Generates random UUIDv4 string', insertText: 'GenerateGUID(${1:false})' }
      ],
      events: []
    },
    Debris: {
      super: 'Instance',
      properties: [],
      methods: [
        { label: 'AddItem', signature: ':AddItem(item: Instance, lifetime: number?)', detail: 'Schedules non-yielding destruction of item after lifetime seconds', insertText: 'AddItem($1, ${2:3})' }
      ],
      events: []
    },
    Lighting: {
      super: 'Instance',
      properties: [
        { label: 'ClockTime', type: 'number', detail: 'Hour of day from 0 to 24 (14 = afternoon, 0 = midnight)' },
        { label: 'TimeOfDay', type: 'string', detail: 'Formatted time string "14:00:00"' },
        { label: 'Brightness', type: 'number', detail: 'Intensity of sunlight illumination' },
        { label: 'Ambient', type: 'Color3', detail: 'Indoor ambient light Color3' },
        { label: 'OutdoorAmbient', type: 'Color3', detail: 'Outdoor sky ambient Color3' },
        { label: 'FogEnd', type: 'number', detail: 'Distance where fog becomes fully opaque' }
      ],
      methods: [],
      events: []
    },
    RemoteEvent: {
      super: 'Instance',
      properties: [],
      methods: [
        { label: 'FireServer', signature: ':FireServer(...: any)', detail: 'Client -> Server: sends arguments to OnServerEvent', insertText: 'FireServer($1)' },
        { label: 'FireClient', signature: ':FireClient(player: Player, ...: any)', detail: 'Server -> Client: sends arguments to specific player', insertText: 'FireClient($1)' },
        { label: 'FireAllClients', signature: ':FireAllClients(...: any)', detail: 'Server -> All Clients: broadcasts arguments to all players', insertText: 'FireAllClients($1)' }
      ],
      events: [
        { label: 'OnServerEvent', detail: 'Server listener: Connect(function(player: Player, ...))' },
        { label: 'OnClientEvent', detail: 'Client listener: Connect(function(...))' }
      ]
    },
    RemoteFunction: {
      super: 'Instance',
      properties: [
        { label: 'OnServerInvoke', type: '(player: Player, ...any) -> ...any', detail: 'Callback invoked when client calls InvokeServer' },
        { label: 'OnClientInvoke', type: '(...any) -> ...any', detail: 'Callback invoked when server calls InvokeClient' }
      ],
      methods: [
        { label: 'InvokeServer', signature: ':InvokeServer(...: any): ...any', detail: 'Yields and invokes OnServerInvoke on server', insertText: 'InvokeServer($1)' },
        { label: 'InvokeClient', signature: ':InvokeClient(player: Player, ...: any): ...any', detail: 'Invokes OnClientInvoke on client', insertText: 'InvokeClient($1)' }
      ],
      events: []
    },
    BindableEvent: {
      super: 'Instance',
      properties: [],
      methods: [
        { label: 'Fire', signature: ':Fire(...: any)', detail: 'Fires bindable Event with arguments', insertText: 'Fire($1)' }
      ],
      events: [
        { label: 'Event', detail: 'RBXScriptSignal fired by :Fire(...)' }
      ]
    },
    ClickDetector: {
      super: 'Instance',
      properties: [
        { label: 'MaxActivationDistance', type: 'number', detail: 'Max distance in studs player can click (default 32)' }
      ],
      methods: [],
      events: [
        { label: 'MouseClick', detail: 'Fires when player clicks parent Part (playerWhoClicked: Player)' },
        { label: 'MouseHoverEnter', detail: 'Fires when cursor hovers over parent Part' },
        { label: 'MouseHoverLeave', detail: 'Fires when cursor leaves parent Part' }
      ]
    },
    ProximityPrompt: {
      super: 'Instance',
      properties: [
        { label: 'ActionText', type: 'string', detail: 'Prompt action title (e.g. "Open Chest")' },
        { label: 'ObjectText', type: 'string', detail: 'Prompt subtitle (e.g. "Golden Chest")' },
        { label: 'KeyboardKeyCode', type: 'Enum.KeyCode', detail: 'Key to trigger prompt (default Enum.KeyCode.E)' },
        { label: 'HoldDuration', type: 'number', detail: 'Seconds key must be held (0 = instant)' },
        { label: 'MaxActivationDistance', type: 'number', detail: 'Max studs distance prompt is visible (default 10)' },
        { label: 'Enabled', type: 'boolean', detail: 'Whether prompt is active and shown' }
      ],
      methods: [],
      events: [
        { label: 'Triggered', detail: 'Fires when player completes prompt interaction (playerWhoTriggered: Player)' },
        { label: 'PromptButtonHoldBegan', detail: 'Fires when player starts holding key' },
        { label: 'PromptButtonHoldEnded', detail: 'Fires when player releases hold key' }
      ]
    },
    ValueBase: {
      super: 'Instance',
      properties: [
        { label: 'Value', type: 'any', detail: 'Stored value inside this Value object' }
      ],
      methods: [],
      events: [
        { label: 'Changed', detail: 'Fires with the NEW Value whenever .Value changes (newValue: any)' }
      ]
    },
    IntValue: { super: 'ValueBase', properties: [], methods: [], events: [] },
    NumberValue: { super: 'ValueBase', properties: [], methods: [], events: [] },
    StringValue: { super: 'ValueBase', properties: [], methods: [], events: [] },
    BoolValue: { super: 'ValueBase', properties: [], methods: [], events: [] },
    ObjectValue: { super: 'ValueBase', properties: [], methods: [], events: [] },
    Sound: {
      super: 'Instance',
      properties: [
        { label: 'SoundId', type: 'string', detail: 'rbxassetid:// audio asset URI' },
        { label: 'Volume', type: 'number', detail: 'Playback loudness (0 to 10, default 0.5)' },
        { label: 'PlaybackSpeed', type: 'number', detail: 'Pitch & speed multiplier (default 1)' },
        { label: 'Looped', type: 'boolean', detail: 'Whether audio repeats endlessly' },
        { label: 'Playing', type: 'boolean', detail: 'Whether audio is currently playing' }
      ],
      methods: [
        { label: 'Play', signature: ':Play()', detail: 'Plays the Sound from beginning', insertText: 'Play()' },
        { label: 'Stop', signature: ':Stop()', detail: 'Stops playback and resets time', insertText: 'Stop()' }
      ],
      events: [
        { label: 'Ended', detail: 'Fires when non-looped Sound completes playback' }
      ]
    },
    ScreenGui: {
      super: 'Instance',
      properties: [
        { label: 'Enabled', type: 'boolean', detail: 'Toggles visibility of entire ScreenGui' },
        { label: 'ResetOnSpawn', type: 'boolean', detail: 'Whether UI resets each time Character respawns' },
        { label: 'IgnoreGuiInset', type: 'boolean', detail: 'Extends ScreenGui into top bar area' },
        { label: 'DisplayOrder', type: 'number', detail: 'Layering priority relative to other ScreenGuis' }
      ],
      methods: [],
      events: []
    },
    GuiObject: {
      super: 'Instance',
      properties: [
        { label: 'Position', type: 'UDim2', detail: '2D UI position relative to parent' },
        { label: 'Size', type: 'UDim2', detail: '2D UI dimensions (Scale & Offset)' },
        { label: 'AnchorPoint', type: 'Vector2', detail: 'Origin pivot from (0,0) top-left to (1,1) bottom-right' },
        { label: 'BackgroundColor3', type: 'Color3', detail: 'Background fill Color3' },
        { label: 'BackgroundTransparency', type: 'number', detail: '0 = solid background, 1 = transparent' },
        { label: 'BorderSizePixel', type: 'number', detail: 'Pixel border width (usually 0 with UIStroke)' },
        { label: 'Visible', type: 'boolean', detail: 'Whether this GuiObject and children render' },
        { label: 'ZIndex', type: 'number', detail: 'Draw order among UI elements' },
        { label: 'Rotation', type: 'number', detail: '2D clockwise rotation in degrees' }
      ],
      methods: [],
      events: [
        { label: 'MouseEnter', detail: 'Fires when pointer enters UI bounds (x: number, y: number)' },
        { label: 'MouseLeave', detail: 'Fires when pointer exits UI bounds (x: number, y: number)' }
      ]
    },
    Frame: { super: 'GuiObject', properties: [], methods: [], events: [] },
    TextLabel: {
      super: 'GuiObject',
      properties: [
        { label: 'Text', type: 'string', detail: 'Displayed text string' },
        { label: 'TextColor3', type: 'Color3', detail: 'Color of rendered text' },
        { label: 'TextSize', type: 'number', detail: 'Font point size in pixels' },
        { label: 'TextScaled', type: 'boolean', detail: 'Automatically scales text to fit bounds' },
        { label: 'Font', type: 'Enum.Font', detail: 'Font family used to draw text' },
        { label: 'RichText', type: 'boolean', detail: 'Enables HTML-like rich text formatting tags' }
      ],
      methods: [],
      events: []
    },
    TextButton: {
      super: 'TextLabel',
      properties: [
        { label: 'AutoButtonColor', type: 'boolean', detail: 'Automatically darkens button on hover/press' }
      ],
      methods: [],
      events: [
        { label: 'MouseButton1Click', detail: 'Fires when button is clicked or tapped on mobile' },
        { label: 'Activated', detail: 'Cross-platform click/tap/gamepad activation signal' }
      ]
    },
    TextBox: {
      super: 'TextLabel',
      properties: [
        { label: 'PlaceholderText', type: 'string', detail: 'Hint text displayed when empty' },
        { label: 'ClearTextOnFocus', type: 'boolean', detail: 'Clears Text when user focuses input' }
      ],
      methods: [
        { label: 'CaptureFocus', signature: ':CaptureFocus()', detail: 'Programmatically focuses the TextBox', insertText: 'CaptureFocus()' },
        { label: 'ReleaseFocus', signature: ':ReleaseFocus(submitted: boolean?)', detail: 'Unfocuses TextBox', insertText: 'ReleaseFocus()' }
      ],
      events: [
        { label: 'FocusLost', detail: 'Fires when user finishes typing (enterPressed: boolean)' }
      ]
    },
    LuaSourceContainer: {
      super: 'Instance',
      properties: [
        { label: 'Enabled', type: 'boolean', detail: 'Whether script runs automatically' },
        { label: 'Disabled', type: 'boolean', detail: 'Legacy inverse of Enabled' }
      ],
      methods: [],
      events: []
    },
    Script: { super: 'LuaSourceContainer', properties: [], methods: [], events: [] },
    LocalScript: { super: 'LuaSourceContainer', properties: [], methods: [], events: [] },
    ModuleScript: { super: 'LuaSourceContainer', properties: [], methods: [], events: [] },
    Folder: { super: 'Instance', properties: [], methods: [], events: [] }
  };

  const SNIPPETS = [
    {
      label: 'playeradded',
      kind: 'snippet',
      detail: 'Players.PlayerAdded + CharacterAdded + leaderstats setup',
      code: [
        'local Players = game:GetService("Players")',
        '',
        'Players.PlayerAdded:Connect(function(player: Player)',
        '\tlocal leaderstats = Instance.new("Folder")',
        '\tleaderstats.Name = "leaderstats"',
        '\tleaderstats.Parent = player',
        '',
        '\tlocal coins = Instance.new("IntValue")',
        '\tcoins.Name = "Coins"',
        '\tcoins.Value = 100',
        '\tcoins.Parent = leaderstats',
        '',
        '\tplayer.CharacterAdded:Connect(function(character)',
        '\t\tprint(`{player.Name} spawned!`)',
        '\tend)',
        'end)'
      ].join('\n')
    },
    {
      label: 'touched',
      kind: 'snippet',
      detail: 'Debounced BasePart.Touched Player detection handler',
      code: [
        'local Players = game:GetService("Players")',
        'local part = script.Parent',
        'local debounce = false',
        '',
        'part.Touched:Connect(function(otherPart)',
        '\tif debounce then return end',
        '\tlocal character = otherPart.Parent',
        '\tlocal player = Players:GetPlayerFromCharacter(character)',
        '\tif player then',
        '\t\tdebounce = true',
        '\t\tprint(`{player.Name} touched {part.Name}!`)',
        '\t\ttask.wait(0.8)',
        '\t\tdebounce = false',
        '\tend',
        'end)'
      ].join('\n')
    },
    {
      label: 'tween',
      kind: 'snippet',
      detail: 'TweenService smooth animation snippet',
      code: [
        'local TweenService = game:GetService("TweenService")',
        '',
        'local info = TweenInfo.new(1.2, Enum.EasingStyle.Quad, Enum.EasingDirection.Out, 0, false, 0)',
        'local tween = TweenService:Create(workspace.CoinPart, info, {',
        '\tPosition = Vector3.new(0, 8, 0),',
        '\tColor = Color3.fromRGB(0, 255, 170)',
        '})',
        'tween:Play()'
      ].join('\n')
    },
    {
      label: 'raycast',
      kind: 'snippet',
      detail: 'Modern workspace:Raycast() with RaycastParams',
      code: [
        'local params = RaycastParams.new()',
        'params.FilterType = Enum.RaycastFilterType.Exclude',
        'params.FilterDescendantsInstances = {}',
        '',
        'local result = workspace:Raycast(Vector3.new(0, 15, 0), Vector3.new(0, -30, 0), params)',
        'if result then',
        '\tprint("Ray hit:", result.Instance.Name, "at", result.Position)',
        'end'
      ].join('\n')
    },
    {
      label: 'datastore',
      kind: 'snippet',
      detail: 'Safe pcall DataStoreService load & save pattern',
      code: [
        'local DataStoreService = game:GetService("DataStoreService")',
        'local coinStore = DataStoreService:GetDataStore("PlayerCoins_v1")',
        '',
        'local success, savedCoins = pcall(function()',
        '\treturn coinStore:GetAsync("User_1001")',
        'end)',
        'if success then',
        '\tprint("Loaded coins:", savedCoins or 0)',
        'end'
      ].join('\n')
    },
    {
      label: 'remoteevent',
      kind: 'snippet',
      detail: 'ReplicatedStorage RemoteEvent listener setup',
      code: [
        'local ReplicatedStorage = game:GetService("ReplicatedStorage")',
        'local remote = ReplicatedStorage:WaitForChild("CoinCollected")',
        '',
        'remote.OnServerEvent:Connect(function(player, amount: number)',
        '\tprint(`Received from {player.Name}:`, amount)',
        'end)'
      ].join('\n')
    }
  ];

  const TEMPLATES = [
    {
      id: 'executor-mock-demo',
      title: 'Executor mock playground',
      badge: 'Exploit Script · browser mock',
      scriptType: 'ExploitScript',
      description: 'Try executor globals, a temporary file, and Luau loadstring in the isolated sandbox.',
      code: [
        '-- This is a browser mock, not a real executor.',
        '-- Files and clipboard are cleared after each run.',
        'if not gethui or not syn or not syn.protect_gui then',
        '\twarn("Executor mock is not available")',
        '\treturn',
        'end',
        '',
        'makefolder("demo")',
        'writefile("demo/hello.txt", "Hello from the executor mock!")',
        'print(readfile("demo/hello.txt"))',
        '',
        'local gui = Instance.new("ScreenGui")',
        'syn.protect_gui(gui)',
        'gui.Parent = gethui()',
        'print("GUI parent:", cloneref(gui).Parent.Name)',
        '',
        'local run, problem = loadstring("return 6 * 7")',
        'if run then print("Luau result:", run()) else warn(problem) end'
      ].join('\n')
    },
    {
      id: 'obby-coins',
      title: 'Spinning Neon Coin + Leaderstats',
      badge: 'Server Script',
      scriptType: 'Script',
      description: 'Animates neon parts, awards leaderstats Coins on touch, and saves to DataStore.',
      code: [
        '--!strict',
        'local Players = game:GetService("Players")',
        'local TweenService = game:GetService("TweenService")',
        'local DataStoreService = game:GetService("DataStoreService")',
        '',
        'local coinStore = DataStoreService:GetDataStore("ObbyCoins_v1")',
        'local coinPart = workspace:WaitForChild("CoinPart")',
        '',
        '-- Setup leaderstats for every player',
        'Players.PlayerAdded:Connect(function(player: Player)',
        '\tlocal stats = Instance.new("Folder")',
        '\tstats.Name = "leaderstats"',
        '\tstats.Parent = player',
        '',
        '\tlocal coins = Instance.new("IntValue")',
        '\tcoins.Name = "Coins"',
        '\tlocal ok, saved = pcall(function()',
        '\t\treturn coinStore:GetAsync("Player_" .. tostring(player.UserId))',
        '\tend)',
        '\tcoins.Value = if ok and saved then saved else 50',
        '\tcoins.Parent = stats',
        '',
        '\tprint(`[Server] {player.Name} joined with {coins.Value} Coins!`)',
        'end)',
        '',
        '-- Touch coin to collect +25 Coins!',
        'local busy = false',
        'coinPart.Touched:Connect(function(hit)',
        '\tif busy then return end',
        '\tlocal player = Players:GetPlayerFromCharacter(hit.Parent)',
        '\tif player and player:FindFirstChild("leaderstats") then',
        '\t\tbusy = true',
        '\t\tlocal coins = player.leaderstats.Coins',
        '\t\tcoins.Value += 25',
        '\t\tcoinStore:SetAsync("Player_" .. tostring(player.UserId), coins.Value)',
        '\t\tprint(`✨ {player.Name} collected a Neon Coin! Total: {coins.Value}`)',
        '',
        '\t\tcoinPart.Transparency = 0.75',
        '\t\ttask.wait(1.2)',
        '\t\tcoinPart.Transparency = 0',
        '\t\tbusy = false',
        '\tend',
        'end)',
        '',
        '-- Smooth floating tween animation',
        'local floatTween = TweenService:Create(',
        '\tcoinPart,',
        '\tTweenInfo.new(1.4, Enum.EasingStyle.Sine, Enum.EasingDirection.InOut, -1, true),',
        '\t{ Position = Vector3.new(coinPart.Position.X, 6.2, coinPart.Position.Z) }',
        ')',
        'floatTween:Play()'
      ].join('\n')
    },
    {
      id: 'killbrick-obby',
      title: 'Lava KillBrick & Respawn Pad',
      badge: 'Server Script',
      scriptType: 'Script',
      description: 'Classic Roblox obby hazard with Humanoid:TakeDamage(), color pulse, and respawn.',
      code: [
        'local Players = game:GetService("Players")',
        'local TweenService = game:GetService("TweenService")',
        '',
        'local killBrick = workspace:WaitForChild("KillBrick")',
        'killBrick.Material = Enum.Material.Neon',
        'killBrick.Color = Color3.fromRGB(255, 65, 54)',
        '',
        'killBrick.Touched:Connect(function(otherPart)',
        '\tlocal character = otherPart.Parent',
        '\tif not character then return end',
        '\tlocal humanoid = character:FindFirstChildOfClass("Humanoid")',
        '\tif humanoid and humanoid.Health > 0 then',
        '\t\twarn(`🔥 {character.Name} stepped on KillBrick!`)',
        '\t\thumanoid:TakeDamage(100)',
        '\tend',
        'end)',
        '',
        'TweenService:Create(',
        '\tkillBrick,',
        '\tTweenInfo.new(0.9, Enum.EasingStyle.Sine, Enum.EasingDirection.InOut, -1, true),',
        '\t{ Color = Color3.fromRGB(255, 155, 30) }',
        '):Play()',
        '',
        'print("[Obby] Lava KillBrick armed and pulsing!")'
      ].join('\n')
    },
    {
      id: 'rainbow-tower',
      title: 'Procedural Rainbow Part Generator',
      badge: 'Server Script',
      scriptType: 'Script',
      description: 'Spawns a spiral staircase of glowing Neon parts in the 3D Viewport using CFrame & Color3.fromHSV.',
      code: [
        'local folder = workspace:FindFirstChild("SpiralTower") or Instance.new("Folder")',
        'folder.Name = "SpiralTower"',
        'folder:ClearAllChildren()',
        'folder.Parent = workspace',
        '',
        'local steps = 18',
        'for i = 1, steps do',
        '\tlocal angle = math.rad(i * 22)',
        '\tlocal radius = 9',
        '\tlocal step = Instance.new("Part")',
        '\tstep.Name = `Step_{i}`',
        '\tstep.Anchored = true',
        '\tstep.Material = Enum.Material.Neon',
        '\tstep.Size = Vector3.new(3.6, 0.6, 1.8)',
        '\tstep.Color = Color3.fromHSV((i / steps) % 1, 0.82, 1)',
        '\tstep.CFrame = CFrame.new(math.cos(angle) * radius, 1 + i * 0.9, math.sin(angle) * radius) * CFrame.Angles(0, -angle, 0)',
        '\tstep.Parent = folder',
        '\ttask.wait(0.05)',
        'end',
        '',
        'print(`🌈 Spawned {steps} glowing spiral steps in Workspace!`)'
      ].join('\n')
    },
    {
      id: 'raycast-scanner',
      title: '3D Raycast Laser Scanner',
      badge: 'Server Script',
      scriptType: 'Script',
      description: 'Casts rays across the Workspace, detects hit materials & positions, and logs results.',
      code: [
        'local params = RaycastParams.new()',
        'params.FilterType = Enum.RaycastFilterType.Exclude',
        'params.FilterDescendantsInstances = {}',
        '',
        'local origins = {',
        '\tVector3.new(0, 20, 0),',
        '\tVector3.new(6, 20, -4),',
        '\tVector3.new(-6, 20, 4)',
        '}',
        '',
        'for index, origin in origins do',
        '\tlocal hit = workspace:Raycast(origin, Vector3.new(0, -35, 0), params)',
        '\tif hit then',
        '\t\tprint(`Ray #{index} hit "{hit.Instance.Name}" at ({hit.Position.X}, {hit.Position.Y}, {hit.Position.Z})`)',
        '\telse',
        '\t\twarn(`Ray #{index} missed everything`)',
        '\tend',
        'end'
      ].join('\n')
    },
    {
      id: 'error-demo',
      title: 'Syntax & Roblox Linter Showcase',
      badge: 'Diagnostics Demo',
      scriptType: 'Script',
      description: 'Demonstrates live VS Code red error line highlighting, Luau hints, and Problems navigation.',
      code: [
        '-- Try fixing each highlighted line below and watch errors vanish live!',
        'local Players = game:GetService("Players")',
        '',
        '-- 1) Client-only API warning inside a Server Script:',
        'local me = Players.LocalPlayer',
        '',
        '-- 2) Deprecated wait() hint (recommends task.wait):',
        'wait(0.5)',
        '',
        '-- 3) Syntax error: missing "then" + JavaScript "!=" operator:',
        'local score = 100',
        'if score != 50',
        '\tprint("High score!")',
        'end'
      ].join('\n')
    }
  ];

  function getClassMembers(className) {
    const props = new Map();
    const methods = new Map();
    const events = new Map();
    let cur = className;
    const visited = new Set();
    while (cur && CLASS_DEFS[cur] && !visited.has(cur)) {
      visited.add(cur);
      const def = CLASS_DEFS[cur];
      for (const p of def.properties || []) {
        if (!props.has(p.label)) props.set(p.label, Object.assign({ kind: 'property', fromClass: cur }, p));
      }
      for (const m of def.methods || []) {
        if (!methods.has(m.label)) methods.set(m.label, Object.assign({ kind: 'method', fromClass: cur }, m));
      }
      for (const e of def.events || []) {
        if (!events.has(e.label)) events.set(e.label, Object.assign({ kind: 'event', fromClass: cur }, e));
      }
      cur = def.super;
    }
    return {
      properties: Array.from(props.values()),
      methods: Array.from(methods.values()),
      events: Array.from(events.values())
    };
  }

  function isClassA(className, targetClass) {
    if (className === targetClass) return true;
    let cur = className;
    const visited = new Set();
    while (cur && CLASS_DEFS[cur] && !visited.has(cur)) {
      if (cur === targetClass) return true;
      visited.add(cur);
      cur = CLASS_DEFS[cur].super;
    }
    if (targetClass === 'Instance') return true;
    if (targetClass === 'BaseScript' && (className === 'Script' || className === 'LocalScript')) return true;
    if (targetClass === 'GuiButton' && (className === 'TextButton' || className === 'ImageButton')) return true;
    return false;
  }

  const RoCodeAPI = {
    KEYWORDS,
    LUAU_TYPES,
    DIRECTIVES,
    GLOBALS,
    EXECUTOR_GLOBALS,
    LIBRARIES,
    ENUMS,
    SERVICES,
    CREATABLE_CLASSES,
    CLASS_DEFS,
    SNIPPETS,
    TEMPLATES,
    getClassMembers,
    isClassA
  };

  root.RoCodeAPI = RoCodeAPI;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = RoCodeAPI;
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
