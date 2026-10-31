// Minimal JSON codec used only by the isolated HttpService mock.
export const jsonLib = String.raw`
local JSON = {}
local function jsonError(message) error("JSON: " .. message, 3) end
local escapes = {['"']='\\"', ['\\']='\\\\', ['\b']='\\b', ['\f']='\\f', ['\n']='\\n', ['\r']='\\r', ['\t']='\\t'}
local function jsonQuote(s)
    return '"' .. string.gsub(s, '[%z\1-\31\\"]', function(c)
        return escapes[c] or string.format('\\u%04x', string.byte(c))
    end) .. '"'
end
function JSON.encode(value)
    local seen = {}
    local function encode(v, depth)
        if depth > 100 then jsonError("maximum nesting exceeded") end
        local t = type(v)
        if t == 'nil' then return 'null' end
        if t == 'boolean' then return v and 'true' or 'false' end
        if t == 'number' then
            if v ~= v or v == math.huge or v == -math.huge then jsonError("non-finite number") end
            return tostring(v)
        end
        if t == 'string' then return jsonQuote(v) end
        if t ~= 'table' then jsonError("unsupported value type " .. t) end
        if typeof(v) ~= 'table' then jsonError("unsupported value type " .. typeof(v)) end
        if seen[v] then jsonError("cyclic table") end
        seen[v] = true
        local count, max, array = 0, 0, true
        for k in v do
            count += 1
            if type(k) ~= 'number' or k < 1 or k % 1 ~= 0 then array = false else max = math.max(max, k) end
        end
        if count == 0 then array = true end
        if array and max ~= count then jsonError("array has missing indices") end
        local result = {}
        if array then
            for i = 1, max do result[i] = encode(v[i], depth + 1) end
            seen[v] = nil
            return '[' .. table.concat(result, ',') .. ']'
        end
        for k, val in v do
            if type(k) ~= 'string' then jsonError("object keys must be strings") end
            table.insert(result, jsonQuote(k) .. ':' .. encode(val, depth + 1))
        end
        seen[v] = nil
        return '{' .. table.concat(result, ',') .. '}'
    end
    return encode(value, 0)
end
function JSON.decode(text)
    if type(text) ~= 'string' then jsonError("input must be a string") end
    local i, n = 1, #text
    local function whitespace() while i <= n and string.find(' \t\r\n', string.sub(text,i,i), 1, true) do i += 1 end end
    local parse
    local function parseString()
        if string.sub(text,i,i) ~= '"' then jsonError('expected a string') end
        i += 1
        local result = {}
        while i <= n do
            -- Copy ordinary text as a chunk, rather than allocating one table entry per byte.
            local special = string.find(text, '["\\%z\1-\31]', i)
            if not special then jsonError('unterminated string') end
            if special > i then table.insert(result, string.sub(text, i, special - 1)) end
            i = special
            local c = string.sub(text,i,i); i += 1
            if c == '"' then return table.concat(result) end
            if c == '\\' then
                local e = string.sub(text,i,i); i += 1
                local map = {['"']='"', ['\\']='\\', ['/']='/', b='\b', f='\f', n='\n', r='\r', t='\t'}
                if map[e] then table.insert(result,map[e])
                elseif e == 'u' then
                    local hex=string.sub(text,i,i+3)
                    if #hex ~= 4 or not string.match(hex,'^%x%x%x%x$') then jsonError('invalid unicode escape') end
                    i += 4
                    local cp=tonumber(hex,16)
                    if cp >= 0xD800 and cp <= 0xDBFF then
                        if string.sub(text,i,i+1) ~= '\\u' then jsonError('missing unicode surrogate') end
                        local low=tonumber(string.sub(text,i+2,i+5),16)
                        if not low or low < 0xDC00 or low > 0xDFFF then jsonError('invalid unicode surrogate') end
                        cp=0x10000 + (cp-0xD800)*0x400 + (low-0xDC00); i += 6
                    elseif cp >= 0xDC00 and cp <= 0xDFFF then jsonError('invalid unicode surrogate') end
                    table.insert(result,utf8.char(cp))
                else jsonError('invalid string escape') end
            else
                if string.byte(c) < 32 then jsonError('control character in string') end
                table.insert(result,c)
            end
        end
        jsonError('unterminated string')
    end
    parse = function(depth)
        if depth > 100 then jsonError('maximum nesting exceeded') end
        whitespace()
        local c=string.sub(text,i,i)
        if c == '"' then return parseString() end
        if c == '{' then
            i += 1; whitespace(); local obj={}
            if string.sub(text,i,i) == '}' then i += 1; return obj end
            while true do
                whitespace(); local key=parseString(); whitespace()
                if string.sub(text,i,i) ~= ':' then jsonError('expected colon') end
                i += 1; obj[key]=parse(depth+1); whitespace(); local delim=string.sub(text,i,i); i += 1
                if delim == '}' then return obj elseif delim ~= ',' then jsonError('expected comma or closing brace') end
            end
        end
        if c == '[' then
            i += 1; whitespace(); local arr={}; local index=1
            if string.sub(text,i,i) == ']' then i += 1; return arr end
            while true do
                arr[index]=parse(depth+1); index += 1; whitespace(); local delim=string.sub(text,i,i); i += 1
                if delim == ']' then return arr elseif delim ~= ',' then jsonError('expected comma or closing bracket') end
            end
        end
        if string.sub(text,i,i+3)=='true' then i+=4;return true end
        if string.sub(text,i,i+4)=='false' then i+=5;return false end
        if string.sub(text,i,i+3)=='null' then i+=4;return nil end
        -- Match at the current offset without copying the entire remaining
        -- input for every value in a large array.
        local number=string.match(text,'^-?%d+%.%d+[eE][+-]?%d+',i) or string.match(text,'^-?%d+[eE][+-]?%d+',i) or string.match(text,'^-?%d+%.%d+',i) or string.match(text,'^-?%d+',i)
        if number and not string.match(number,'^-?0%d') then i += #number; return tonumber(number) end
        jsonError('unexpected token at byte ' .. i)
    end
    local value=parse(0); whitespace(); if i <= n then jsonError('trailing content at byte ' .. i) end
    return value
end
`;
