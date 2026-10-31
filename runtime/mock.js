// Browser mock: metadata-driven member validation plus a deliberately limited
// simulation. API signatures do not contain Roblox engine implementations.
import { metadata } from './api-metadata.js';
import { jsonLib } from './json.js';
export const bootstrap = metadata + jsonLib + String.raw`
local function output(kind, ...)
    local values = table.pack(...)
    local strings = table.create(values.n)
    for i = 1, values.n do strings[i] = tostring(values[i]) end
    __output(kind, table.concat(strings, "\t"))
end
print = function(...) output("print", ...) end
warn = function(...) output("warn", ...) end
local isClient = __scriptType == "LocalScript" or __scriptType == "ExploitScript"
local isExecutor = __scriptType == "ExploitScript"
local function unsupported(name)
    error("Browser mock does not implement " .. name .. ". This API is listed in the dump but needs Roblox engine behavior.", 3)
end

-- Metatables keep user-visible Instances empty so reads and writes are checked.
local instances = setmetatable({}, {__mode = "k"})
local previewRects = {}
local signals = setmetatable({}, {__mode = "k"})
local mockTypes = setmetatable({}, {__mode = "k"})
local luauTypeof = typeof
typeof = function(value)
    if type(value) == "table" then
        if instances[value] then return "Instance" end
        if signals[value] then return "RBXScriptSignal" end
        if mockTypes[value] then return mockTypes[value] end
    end
    return luauTypeof(value)
end
local makeObject, service, isA
local uiMouseX, uiMouseY = 0, 0
local methodImpl = {}
local function member(className, category, key)
    local seen = {}
    while className and not seen[className] do
        seen[className] = true
        local def = API[className]
        if not def then break end
        if def[category] and def[category][key] ~= nil then return def[category][key] end
        className = def.super
    end
    return nil
end
isA = function(className, target)
    local seen = {}
    while className and not seen[className] do
        if className == target then return true end
        seen[className] = true
        local def = API[className]
        className = def and def.super or nil
    end
    return false
end
local function newSignal(name)
    local connections = {}
    local signal = {}
    signals[signal] = connections
    local signalMethods = {}
    function signalMethods:Connect(fn)
        if type(fn) ~= "function" then error("Connect expects a function", 2) end
        local connection = setmetatable({Connected = true, Enabled = true, Function = fn}, {
            __index = function(self, key) if key == "State" then return self.Connected and self.Enabled end end
        })
        function connection:Disconnect() self.Connected = false; self.Enabled = false end
        function connection:Disable() self.Enabled = false end
        function connection:Enable() if self.Connected then self.Enabled = true end end
        function connection:Fire(...) if self.Connected and self.Enabled then return fn(...) end end
        table.insert(connections, {fn = fn, connection = connection})
        return connection
    end
    function signalMethods:Once(fn)
        local connection
        connection = self:Connect(function(...)
            connection:Disconnect()
            fn(...)
        end)
        return connection
    end
    function signalMethods:Wait() unsupported(name .. ":Wait()") end
    return setmetatable(signal, {
        __index = function(_, key)
            if signalMethods[key] then return signalMethods[key] end
            error(tostring(key) .. " is not a valid member of RBXScriptSignal " .. name, 2)
        end,
        __newindex = function() error("RBXScriptSignal is read only", 2) end,
        __tostring = function() return "Signal " .. name end,
    })
end
local function fire(signal, ...)
    local list = signals[signal]
    if not list then return end
    local snapshot = table.clone(list)
    for _, entry in snapshot do
        if entry.connection.Connected and entry.connection.Enabled then
            local ok, message = pcall(entry.fn, ...)
            if not ok then output("error", "Mock event callback: " .. tostring(message)) end
        end
    end
end
local function state(obj)
    local s = instances[obj]
    if not s then error("Expected a mock Instance", 3) end
    return s
end
local function getSignal(s, name)
    if not s.events[name] then s.events[name] = newSignal(s.class .. "." .. name) end
    return s.events[name]
end
local function removeFromParent(obj, parent)
    if not parent then return end
    local p = instances[parent]
    if not p then return end
    local index = table.find(p.children, obj)
    if index then table.remove(p.children, index) end
    if p.events.ChildRemoved then fire(p.events.ChildRemoved, obj) end
end
local function setParent(obj, parent)
    local s = state(obj)
    if s.destroyed then error("The Parent property of " .. s.class .. " is locked after Destroy", 3) end
    if s.reparenting then error("Cannot change Parent while an ancestry change is in progress", 3) end
    if parent ~= nil then
        state(parent)
        local cur = parent
        while cur do
            if cur == obj then error("Cannot parent an Instance to itself or its descendants", 3) end
            cur = instances[cur] and instances[cur].parent or nil
        end
    end
    if s.parent == parent then return end
    local old = s.parent
    -- Snapshot the moved subtree and its old/new ancestor chains.
    local subtree = {}
    local function collect(item)
        table.insert(subtree, item)
        for _, child in table.clone(state(item).children) do collect(child) end
    end
    collect(obj)
    local oldChain, newChain, oldSet, newSet = {}, {}, {}, {}
    local cur = old
    while cur do table.insert(oldChain,cur); oldSet[cur]=true; cur=instances[cur].parent end
    cur=parent
    while cur do table.insert(newChain,cur); newSet[cur]=true; cur=instances[cur].parent end
    s.reparenting = true
    -- DescendantRemoving fires before the parent changes, once per moved item.
    for _, ancestor in oldChain do
        if not newSet[ancestor] then
            local as=instances[ancestor]
            if as.events.DescendantRemoving then for _, item in subtree do fire(as.events.DescendantRemoving,item) end end
        end
    end
    s.parent = nil
    removeFromParent(obj, old)
    s.parent = parent
    if parent then
        local p = state(parent)
        table.insert(p.children, obj)
        if p.events.ChildAdded then fire(p.events.ChildAdded, obj) end
    end
    for _, ancestor in newChain do
        if not oldSet[ancestor] then
            local as=instances[ancestor]
            if as.events.DescendantAdded then for _, item in subtree do fire(as.events.DescendantAdded,item) end end
        end
    end
    for _, item in subtree do
        local ts=instances[item]
        if ts and not ts.destroyed and ts.events.AncestryChanged then fire(ts.events.AncestryChanged,obj,parent) end
    end
    s.reparenting = false
end

local function defaultValue(typeName)
    if string.sub(typeName, 1, 1) == "!" then typeName = string.sub(typeName, 2) end
    if typeName == "boolean" then return false end
    if typeName == "number" or typeName == "int" or typeName == "int64" or typeName == "float" or typeName == "double" then return 0 end
    if typeName == "string" or typeName == "Content" or typeName == "ContentId" then return "" end
    return nil
end
-- Approximate content-based GUI sizes for scripts that use AbsoluteSize to
-- expand sections. Child calculations receive the current parent size, which
-- prevents cycles when an automatic-sized parent measures its own children.
local approximateSize
local function zeroHeightExtent(obj, parentSize, depth)
    if depth>24 then return 0 end
    local lowest=0
    for _,child in state(obj).children do
        local cs=state(child)
        if isA(cs.class,"GuiObject") and cs.values.Visible~=false then
            local measured=approximateSize(child,depth+1,parentSize)
            local height=measured.Y
            if height<=0 then height=zeroHeightExtent(child,measured,depth+1) end
            local pos=cs.values.Position
            local y=pos and (pos.Y.Scale*parentSize.Y+pos.Y.Offset) or 0
            lowest=math.max(lowest,y+height)
        end
    end
    return lowest
end
approximateSize = function(obj, depth, givenParent)
    if depth>24 then return Vector2.zero end
    if previewRects[obj] then return previewRects[obj].size end
    local s=state(obj)
    if s.class=="ScreenGui" then return Vector2.new(800,450) end
    if not isA(s.class,"GuiObject") then return Vector2.new(800,450) end
    local parent=givenParent
    if not parent then
        parent=Vector2.new(800,450)
        if s.parent and (isA(state(s.parent).class,"GuiObject") or state(s.parent).class=="ScreenGui") then parent=approximateSize(s.parent,depth+1) end
    end
    local size=s.values.Size or UDim2.fromOffset(100,100)
    local width=math.max(0,size.X.Scale*parent.X+size.X.Offset)
    local height=math.max(0,size.Y.Scale*parent.Y+size.Y.Offset)
    for _,child in s.children do
        local cs=state(child)
        if cs.class=="UIAspectRatioConstraint" and cs.values.Enabled~=false then
            local ratio=cs.values.AspectRatio or 1
            if type(ratio)=="number" and ratio>0 then
                if cs.values.DominantAxis==Enum.DominantAxis.Height then width=height*ratio else height=width/ratio end
            end
            break
        end
    end
    local auto=s.values.AutomaticSize
    local autoX=auto==Enum.AutomaticSize.X or auto==Enum.AutomaticSize.XY
    local autoY=auto==Enum.AutomaticSize.Y or auto==Enum.AutomaticSize.XY
    if autoX or autoY then
        local contentX,contentY=0,0
        if isA(s.class,"TextLabel") or isA(s.class,"TextButton") or isA(s.class,"TextBox") then
            local text=s.values.Text or "";local font=s.values.TextSize or 14
            local chars,maxchars,lines=0,0,1
            for line in string.gmatch(text.."\n","(.-)\n") do
                chars=utf8.len(line) or #line;maxchars=math.max(maxchars,chars)
                local textWidth=chars*font*0.55
                if s.values.TextWrapped and width>0 then lines+=math.max(0,math.ceil(textWidth/width)-1) end
                lines+=1
            end
            contentX=maxchars*font*0.55;contentY=math.max(1,lines-1)*font*1.2
        end
        local layout,pad
        for _,child in s.children do local cs=state(child);if cs.class=="UIListLayout" then layout=cs elseif cs.class=="UIPadding" then pad=cs end end
        local horizontal=layout and layout.values.FillDirection==Enum.FillDirection.Horizontal
        local major,minor,count=0,0,0
        local base=Vector2.new(width,height)
        for _,child in s.children do
            local cs=state(child)
            if isA(cs.class,"GuiObject") and cs.values.Visible~=false then
                local childSize=approximateSize(child,depth+1,base)
                if childSize.Y<=0 then
                    local extent=zeroHeightExtent(child,childSize,depth+1)
                    if extent>0 then childSize=Vector2.new(childSize.X,extent) end
                end
                if layout then major+=horizontal and childSize.X or childSize.Y;minor=math.max(minor,horizontal and childSize.Y or childSize.X);count+=1
                else contentX=math.max(contentX,childSize.X);contentY=math.max(contentY,childSize.Y) end
            end
        end
        if layout then
            local gap=layout.values.Padding
            if gap then major+=math.max(0,count-1)*(gap.Offset+gap.Scale*(horizontal and width or height)) end
            contentX=math.max(contentX,horizontal and major or minor);contentY=math.max(contentY,horizontal and minor or major)
        end
        if pad then
            local function amount(key,baseValue) local p=pad.values[key];return p and p.Offset+p.Scale*baseValue or 0 end
            contentX+=amount("PaddingLeft",width)+amount("PaddingRight",width)
            contentY+=amount("PaddingTop",height)+amount("PaddingBottom",height)
        end
        if autoX then width=math.max(width,contentX) end
        if autoY then height=math.max(height,contentY) end
    end
    return Vector2.new(width,height)
end
local objectMeta = {}
local legacyInstanceMethods={children="GetChildren",getChildren="GetChildren",findFirstChild="FindFirstChild",clone="Clone",destroy="Destroy",remove="Remove",Remove="Remove",isDescendantOf="IsDescendantOf"}
function objectMeta.__index(obj, key)
    local s = state(obj)
    if type(key) ~= "string" then error("Instance member name must be a string", 2) end
    -- Roblox still exposes these documented deprecated Instance aliases.
    if isA(s.class,"Instance") then
        local canonical=legacyInstanceMethods[key]; if canonical then return methodImpl[canonical] end
    end
    if s.class == "DataModel" and (key == "HttpGet" or key == "HttpGetAsync" or key == "HttpPost" or key == "HttpPostAsync") then return methodImpl[key] end
    local property = member(s.class, "p", key)
    if property then
        if key == "Parent" then return s.parent end
        if key == "ClassName" then return s.class end
        -- Simplified layout for scripts that read calculated GUI geometry.
        if previewRects[obj] and key=="AbsolutePosition" then return previewRects[obj].position end
        if previewRects[obj] and key=="AbsoluteSize" then return previewRects[obj].size end
        if s.class=="ScreenGui" and key=="AbsoluteSize" and Vector2 then return Vector2.new(800,450) end
        if isA(s.class, "GuiObject") and (key=="AbsoluteSize" or key=="AbsolutePosition") and Vector2 and UDim2 then
            local parentSize, parentPosition = Vector2.new(800,450), Vector2.zero
            if s.parent and isA(state(s.parent).class, "GuiObject") then
                parentSize, parentPosition=s.parent.AbsoluteSize,s.parent.AbsolutePosition
            end
            local absolute=approximateSize(obj,0,parentSize)
            if key=="AbsoluteSize" then return absolute end
            local pos=s.values.Position or UDim2.new()
            local anchor=s.values.AnchorPoint or Vector2.zero
            return parentPosition+Vector2.new(pos.X.Scale*parentSize.X+pos.X.Offset-anchor.X*absolute.X,pos.Y.Scale*parentSize.Y+pos.Y.Offset-anchor.Y*absolute.Y)
        end
        if s.class=="UIListLayout" and key=="AbsoluteContentSize" and Vector2 then
            local horizontal=s.values.FillDirection==Enum.FillDirection.Horizontal
            local major,minor,count=0,0,0
            if s.parent then
                for _,child in state(s.parent).children do
                    local cs=state(child)
                    if isA(cs.class,"GuiObject") and cs.values.Visible~=false then
                        local parentSize=approximateSize(s.parent,0)
                        local size=approximateSize(child,0,parentSize)
                        major+=horizontal and size.X or size.Y
                        minor=math.max(minor,horizontal and size.Y or size.X)
                        count+=1
                    end
                end
                local padding=s.values.Padding
                if padding then
                    local parentSize=s.parent.AbsoluteSize
                    major+=math.max(0,count-1)*(padding.Offset+padding.Scale*(horizontal and parentSize.X or parentSize.Y))
                end
            end
            return horizontal and Vector2.new(major,minor) or Vector2.new(minor,major)
        end
        local value = s.values[key]
        if value ~= nil then return value end
        return defaultValue(property)
    end
    if member(s.class, "e", key) then return getSignal(s, key) end
    if member(s.class, "f", key) then
        local implementation = methodImpl[key]
        if implementation then return implementation end
        return function() unsupported(s.class .. ":" .. key .. "()") end
    end
    for _, child in s.children do if state(child).values.Name == key then return child end end
    error(key .. " is not a valid member of " .. s.class .. ' "' .. tostring(s.values.Name) .. '"', 2)
end
function objectMeta.__newindex(obj, key, value)
    local s = state(obj)
    local property = type(key) == "string" and member(s.class, "p", key) or nil
    if not property then error(tostring(key) .. " is not a valid property of " .. s.class, 2) end
    if string.sub(property, 1, 1) == "!" then error(s.class .. "." .. key .. " is read only", 2) end
    if key == "Parent" then setParent(obj, value) else
        local kind = string.gsub(property, "%?$", "")
        if value == nil and kind == property and (kind == "boolean" or kind == "string" or kind == "number" or kind == "int" or kind == "int64") then
            error(key .. " cannot be nil", 2)
        end
        local expected = kind
        if kind == "int" or kind == "int64" or kind == "float" or kind == "double" then expected = "number" end
        if expected=="string" and type(value)=="number" then value=tostring(value) end
        if value ~= nil and ((expected == "boolean" or expected == "string" or expected == "number" or expected == "function") and type(value) ~= expected) then
            error(key .. " expects " .. expected .. ", got " .. type(value), 2)
        end
        if value ~= nil and (kind == "Vector2" or kind == "Vector3" or kind == "UDim" or kind == "UDim2" or kind == "Color3" or kind == "CFrame") and typeof(value) ~= kind then
            error(key .. " expects " .. kind .. ", got " .. typeof(value), 2)
        end
        local enumName = string.match(kind, "^Enum%.(%w+)$")
        -- Roblox accepts enum item names as strings when assigning properties.
        if value ~= nil and enumName and type(value)=="string" and ENUMS[enumName] and ENUMS[enumName][value] ~= nil then
            value=Enum[enumName][value]
        end
        if value ~= nil and enumName and (typeof(value) ~= "EnumItem" or value.EnumType ~= Enum[enumName]) then
            error(key .. " expects Enum." .. enumName, 2)
        end
        if value ~= nil and API[kind] and isA(kind, "Instance") and (not instances[value] or not isA(instances[value].class, kind)) then
            error(key .. " expects " .. kind .. " Instance", 2)
        end
        s.values[key] = value
    end
    if s.events.Changed then
        if key == "Value" and isA(s.class, "ValueBase") then fire(s.events.Changed, value)
        else fire(s.events.Changed, key) end
    end
    if s.propertySignals[key] then fire(s.propertySignals[key]) end
end
function objectMeta.__tostring(obj) return instances[obj] and tostring(instances[obj].values.Name) or "Instance" end
makeObject = function(className, name)
    if not API[className] then error("Unknown Roblox class '" .. tostring(className) .. "'", 3) end
    local obj = setmetatable({}, objectMeta)
    instances[obj] = {class=className, values={Name=name or className, Archivable=true}, children={}, parent=nil, events={}, propertySignals={}, attributes={}, attributeSignals={}}
    local v = instances[obj].values
    -- A small set of documented defaults. Services and datatypes are mocks.
    if isA(className,"BasePart") and Vector3 and CFrame then
        v.Position=Vector3.new(0,0,0); v.Size=Vector3.new(4,1,2); v.CFrame=CFrame.new()
        v.Anchored=false; v.CanCollide=true; v.CanTouch=true; v.Transparency=0
    end
    if isA(className,"GuiObject") and UDim2 and Vector2 and Color3 then
        v.Position=UDim2.new(); v.Size=UDim2.fromOffset(100,100); v.AnchorPoint=Vector2.new()
        v.Visible=true; v.BackgroundColor3=Color3.new(1,1,1); v.BackgroundTransparency=0
    end
    if className=="Humanoid" then
        v.Health=100; v.MaxHealth=100; v.WalkSpeed=16; v.JumpPower=50; v.JumpHeight=7.2; v.AutoRotate=true
    end
    if className=="Camera" and CFrame and Vector2 and Enum then
        v.CFrame=CFrame.new(); v.Focus=CFrame.new(); v.FieldOfView=70
        v.ViewportSize=Vector2.new(800,450); v.CameraType=Enum.CameraType.Custom
    end
    if className=="ScreenGui" then v.Enabled=true; v.ResetOnSpawn=true end
    if className=="TextLabel" or className=="TextButton" or className=="TextBox" then
        v.Text=""; v.TextSize=14
    end
    return obj
end
function methodImpl:IsA(className) return isA(state(self).class, className) end
function methodImpl:GetChildren() return table.clone(state(self).children) end
function methodImpl:GetDescendants()
    local result = {}
    local function walk(obj) for _, child in state(obj).children do table.insert(result, child); walk(child) end end
    walk(self)
    return result
end
function methodImpl:FindFirstChild(name, recursive)
    if type(name) ~= "string" then error("FindFirstChild expects a string name",2) end
    if recursive ~= nil and type(recursive) ~= "boolean" then error("FindFirstChild recursive must be a boolean",2) end
    for _, child in state(self).children do if state(child).values.Name == name then return child end end
    if recursive then for _, child in state(self).children do local found = methodImpl.FindFirstChild(child, name, true); if found then return found end end end
    return nil
end
function methodImpl:FindFirstChildOfClass(className)
    if type(className) ~= "string" then error("FindFirstChildOfClass expects a string",2) end
    for _, child in state(self).children do if state(child).class == className then return child end end
    return nil
end
function methodImpl:FindFirstChildWhichIsA(className, recursive)
    if type(className) ~= "string" then error("FindFirstChildWhichIsA expects a string",2) end
    if recursive ~= nil and type(recursive) ~= "boolean" then error("FindFirstChildWhichIsA recursive must be a boolean",2) end
    for _, child in state(self).children do if isA(state(child).class, className) then return child end end
    if recursive then for _, child in state(self).children do local found = methodImpl.FindFirstChildWhichIsA(child, className, true); if found then return found end end end
    return nil
end
function methodImpl:WaitForChild(name, timeout)
    if type(name) ~= "string" then error("WaitForChild expects a string name",2) end
    if timeout ~= nil and (type(timeout) ~= "number" or timeout ~= timeout) then error("WaitForChild timeout must be a number",2) end
    local child = methodImpl.FindFirstChild(self, name)
    if child then return child end
    if timeout ~= nil and timeout <= 0 then return nil end
    -- The browser mock has an approximate scheduler. Poll while yielding to the
    -- worker; the normal execution timeout still terminates indefinite waits.
    local elapsed=0
    while timeout == nil or elapsed < timeout do
        if __publishUI then __publishUI() end
        local duration=timeout and math.min(0.05,timeout-elapsed) or 0.05
        local waited=__wait(duration)
        elapsed += type(waited)=="number" and math.max(waited,0.001) or duration
        child=methodImpl.FindFirstChild(self,name)
        if child then return child end
    end
    return nil
end

function methodImpl:GetFullName()
    local names = {}
    local obj = self
    while obj do local s = state(obj); table.insert(names, 1, s.values.Name); obj = s.parent end
    return table.concat(names, ".")
end
function methodImpl:IsDescendantOf(ancestor)
    state(ancestor)
    local obj = state(self).parent
    while obj do if obj == ancestor then return true end; obj = state(obj).parent end
    return false
end
function methodImpl:IsAncestorOf(descendant)
    state(self); state(descendant)
    return methodImpl.IsDescendantOf(descendant,self)
end
function methodImpl:GetActor()
    local obj=self
    while obj do local s=state(obj); if s.class=="Actor" then return obj end; obj=s.parent end
    return nil
end
local function disconnectInstanceSignals(s)
    for _, group in {s.events,s.propertySignals,s.attributeSignals} do
        for _, signal in group do
            local entries=signals[signal]
            if entries then for _, entry in entries do entry.connection:Disconnect() end end
        end
    end
end
function methodImpl:Destroy()
    local s = state(self)
    if s.destroyed or s.destroying then return end
    s.destroying=true
    if s.events.Destroying then fire(s.events.Destroying) end
    for _, child in table.clone(s.children) do methodImpl.Destroy(child) end
    setParent(self, nil)
    disconnectInstanceSignals(s)
    s.destroyed=true; s.destroying=false
end
-- Remove is deprecated but differs from Destroy: it unparents without locking.
function methodImpl:Remove()
    local s=state(self)
    for _, child in table.clone(s.children) do methodImpl.Remove(child) end
    setParent(self,nil)
end

function methodImpl:ClearAllChildren() for _, child in table.clone(state(self).children) do methodImpl.Destroy(child) end end
function methodImpl:Clone()
    local s = state(self)
    if s.values.Archivable == false then return nil end
    local copy = makeObject(s.class, s.values.Name)
    local c = state(copy)
    for k, v in s.values do c.values[k] = v end
    for k, v in s.attributes do c.attributes[k] = v end
    for _, child in s.children do local cloned = methodImpl.Clone(child); if cloned then setParent(cloned, copy) end end
    return copy
end
function methodImpl:GetPropertyChangedSignal(name)
    local s = state(self)
    if not member(s.class, "p", name) then error(name .. " is not a valid property of " .. s.class, 2) end
    if not s.propertySignals[name] then s.propertySignals[name] = newSignal(s.class .. "." .. name .. "Changed") end
    return s.propertySignals[name]
end
function methodImpl:GetAttribute(name) return state(self).attributes[name] end
function methodImpl:GetAttributes() return table.clone(state(self).attributes) end
function methodImpl:SetAttribute(name, value)
    local s = state(self); s.attributes[name] = value
    if s.attributeSignals[name] then fire(s.attributeSignals[name]) end
end
function methodImpl:GetAttributeChangedSignal(name)
    local s = state(self)
    if not s.attributeSignals[name] then s.attributeSignals[name] = newSignal(s.class .. "." .. tostring(name) .. "AttributeChanged") end
    return s.attributeSignals[name]
end
function methodImpl:GetService(name)
    if not isA(state(self).class, "ServiceProvider") then unsupported(state(self).class .. ":GetService()") end
    return service(name)
end
function methodImpl:FindService(name)
    if not isA(state(self).class, "ServiceProvider") then unsupported(state(self).class .. ":FindService()") end
    return service(name, true)
end
function methodImpl:IsClient() if state(self).class ~= "RunService" then unsupported("IsClient") end return isClient end
function methodImpl:IsServer() if state(self).class ~= "RunService" then unsupported("IsServer") end return not isClient end
-- No real Roblox avatar service is connected; return an explicitly unavailable thumbnail.
function methodImpl:GetUserThumbnailAsync(userId, thumbnailType, thumbnailSize)
    if state(self).class ~= "Players" or type(userId) ~= "number" or typeof(thumbnailType) ~= "EnumItem" or thumbnailType.EnumType ~= Enum.ThumbnailType or typeof(thumbnailSize) ~= "EnumItem" or thumbnailSize.EnumType ~= Enum.ThumbnailSize then error("GetUserThumbnailAsync expects a userId, ThumbnailType and ThumbnailSize", 2) end
    return "", false
end
function methodImpl:IsStudio() if state(self).class ~= "RunService" then unsupported("IsStudio") end return false end
function methodImpl:IsRunning() if state(self).class ~= "RunService" then unsupported("IsRunning") end return false end
function methodImpl:GetPlayers()
    if state(self).class ~= "Players" then unsupported("GetPlayers") end
    local p = state(self).values.LocalPlayer
    return p and {p} or {}
end
function methodImpl:GetPlayerFromCharacter(character)
    local s=state(self)
    if s.class ~= "Players" then unsupported(s.class .. ":GetPlayerFromCharacter()") end
    local player=s.values.LocalPlayer
    if player and state(player).values.Character == character and character ~= nil then return player end
    return nil
end
function methodImpl:GetMouseLocation()
    if state(self).class ~= "UserInputService" then unsupported("GetMouseLocation") end
    return Vector2.new(uiMouseX,uiMouseY)
end
function methodImpl:GetMouse()
    local s=state(self)
    if s.class ~= "Player" then unsupported(s.class .. ":GetMouse()") end
    if not isClient or state(service("Players")).values.LocalPlayer~=self then error("GetMouse is only available for the local player in this browser mock",2) end
    if not s.mouse then
        s.mouse=makeObject("PlayerMouse", "Mouse")
        local m=state(s.mouse).values
        m.X=0; m.Y=0; m.Hit=CFrame.new()
    end
    return s.mouse
end
function methodImpl:GetPlayerByUserId(userId)
    local s=state(self)
    if s.class ~= "Players" then unsupported(s.class .. ":GetPlayerByUserId()") end
    local player=s.values.LocalPlayer
    if player and state(player).values.UserId == userId then return player end
    return nil
end
function methodImpl:Invoke(...)
    local s=state(self)
    if s.class ~= "BindableFunction" then unsupported(s.class .. ":Invoke()") end
    local callback=s.values.OnInvoke
    if type(callback) ~= "function" then error("BindableFunction.OnInvoke is not set",2) end
    return callback(...)
end
function methodImpl:Fire(...)
    if state(self).class ~= "BindableEvent" then unsupported(state(self).class .. ":Fire()") end
    fire(getSignal(state(self), "Event"), ...)
end
-- Browser HTTP: explicit permission and browser CORS apply. This does not bypass the browser.
local lastHttpBody, lastHttpURL
local base64Values={}
do
    local chars="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
    for index=1,#chars do base64Values[string.byte(chars,index)]=index-1 end
end
local function decodeBinaryBody(encoded)
    local n=#encoded
    if n%4~=0 then error("Invalid binary HTTP response encoding",3) end
    local padding=(string.sub(encoded,-1)=="=" and 1 or 0)+(string.sub(encoded,-2,-2)=="=" and 1 or 0)
    local output=buffer.create(n/4*3-padding)
    local offset=0
    for i=1,n,4 do
        local a,b,c,d=string.byte(encoded,i,i+3)
        a,b,c,d=base64Values[a],base64Values[b],base64Values[c] or 0,base64Values[d] or 0
        if a==nil or b==nil then error("Invalid binary HTTP response encoding",3) end
        local value=a*262144+b*4096+c*64+d
        buffer.writeu8(output,offset,math.floor(value/65536)%256);offset+=1
        if offset<buffer.len(output) then buffer.writeu8(output,offset,math.floor(value/256)%256);offset+=1 end
        if offset<buffer.len(output) then buffer.writeu8(output,offset,value%256);offset+=1 end
    end
    return buffer.tostring(output)
end
local function httpRequest(options)
    if type(options) ~= "table" then error("HTTP request expects a dictionary", 3) end
    if type(options.Url) ~= "string" or not string.match(options.Url, "^https?://") then error("HTTP request requires an http or https Url", 3) end
    local method=options.Method or "GET"
    if type(method) ~= "string" then error("HTTP Method must be a string", 3) end
    method=string.upper(method)
    if options.Body ~= nil and type(options.Body) ~= "string" then error("HTTP Body must be a string", 3) end
    if options.Headers ~= nil and type(options.Headers) ~= "table" then error("HTTP Headers must be a dictionary", 3) end
    if options.Cookies ~= nil then error("Browser HTTP requests do not support executor Cookies",3) end
    if (method=="GET" or method=="HEAD") and options.Body ~= nil then error("GET and HEAD requests cannot have a Body", 3) end
    if options.Compress ~= nil and options.Compress ~= false and tostring(options.Compress) ~= "Enum.HttpCompression.None" then error("Browser HTTP mock does not support request compression",3) end
    if options.Timeout ~= nil then error("Custom HTTP timeouts are not supported; browser requests time out after 60 seconds",3) end
    if not __http and not __httpStart then error("HTTP bridge unavailable in this environment",3) end
    local encoded=JSON.encode({Url=options.Url,Method=method,Headers=options.Headers or {},Body=options.Body,NoCache=options.NoCache==true})
    local response
    if __httpStart then
        -- Per-request handles keep nested/concurrent responses separate.
        local handle=__httpStart(encoded)
        local chunks={}
        while true do
            local part=__httpNext(handle)
            if not part or part=="" then break end
            table.insert(chunks,part)
        end
        response=JSON.decode(table.concat(chunks))
    else
        response=JSON.decode(__http(encoded))
    end
    if not response.ok then error(response.error or "HTTP request failed",3) end
    if response.result.BodyBase64 ~= nil then
        response.result.Body=decodeBinaryBody(response.result.BodyBase64)
        response.result.BodyBase64=nil
    end
    if type(response.result.Headers) == "table" then
        setmetatable(response.result.Headers, {__index=function(t,k) if type(k)=="string" then return rawget(t,string.lower(k)) end end})
    end
    if response.result.Success then lastHttpBody=response.result.Body; lastHttpURL=options.Url end
    return response.result
end
local function requireHttpBody(response)
    if not response.Success then error("HTTP "..tostring(response.StatusCode).." "..tostring(response.StatusMessage),3) end
    return response.Body
end
local function httpGet(url,nocache,headers)
    if nocache ~= nil and type(nocache) ~= "boolean" then error("GetAsync nocache must be a boolean",3) end
    return requireHttpBody(httpRequest({Url=url,Method="GET",Headers=headers,NoCache=nocache}))
end
function methodImpl:RequestAsync(options)
    if state(self).class ~= "HttpService" then unsupported(state(self).class .. ":RequestAsync()") end
    return httpRequest(options)
end
function methodImpl:PostAsync(url,data,contentType,compress,headers)
    if state(self).class ~= "HttpService" then unsupported(state(self).class .. ":PostAsync()") end
    if type(data) ~= "string" then error("PostAsync data must be a string",2) end
    if compress ~= nil and type(compress) ~= "boolean" then error("PostAsync compress must be a boolean",2) end
    if compress then error("Browser HTTP mock does not support request compression",2) end
    if headers ~= nil and type(headers) ~= "table" then error("PostAsync headers must be a dictionary",2) end
    if contentType ~= nil and (typeof(contentType) ~= "EnumItem" or contentType.EnumType ~= Enum.HttpContentType) then error("PostAsync contentType expects Enum.HttpContentType",2) end
    local name=contentType and contentType.Name or "ApplicationJson"
    local types={ApplicationJson="application/json",ApplicationXml="application/xml",ApplicationUrlEncoded="application/x-www-form-urlencoded",TextPlain="text/plain",TextXml="text/xml"}
    if not types[name] then error("Unsupported HttpContentType",2) end
    local h=table.clone(headers or {});local hasType=false
    for k in h do if type(k)=="string" and string.lower(k)=="content-type" then hasType=true end end
    if not hasType then h["Content-Type"]=types[name] end
    return requireHttpBody(httpRequest({Url=url,Method="POST",Body=data,Headers=h}))
end
function methodImpl:HttpGet(url, nocache)
    if state(self).class ~= "DataModel" then unsupported("HttpGet") end
    return httpGet(url,nocache,nil)
end
function methodImpl:HttpGetAsync(url, requestType)
    if state(self).class ~= "DataModel" then unsupported("HttpGetAsync") end
    if requestType ~= nil and (typeof(requestType) ~= "EnumItem" or requestType.EnumType ~= Enum.HttpRequestType) then error("HttpGetAsync expects Enum.HttpRequestType",2) end
    return httpGet(url,false,nil)
end
function methodImpl:HttpPost(url, data, contentType)
    if state(self).class ~= "DataModel" then unsupported("HttpPost") end
    if type(data) ~= "string" then error("HttpPost data must be a string",2) end
    if contentType ~= nil and type(contentType) ~= "string" then error("HttpPost contentType must be a string",2) end
    return requireHttpBody(httpRequest({Url=url,Method="POST",Body=data,Headers={["Content-Type"]=contentType or "*/*"}}))
end
methodImpl.HttpPostAsync=methodImpl.HttpPost

-- HttpService local utilities.

function methodImpl:JSONEncode(value)
    if state(self).class ~= "HttpService" then unsupported("JSONEncode") end
    return JSON.encode(value)
end
function methodImpl:JSONDecode(value)
    if state(self).class ~= "HttpService" then unsupported("JSONDecode") end
    if type(value) ~= "string" then error("JSONDecode expects a string", 2) end
    return JSON.decode(value)
end
function methodImpl:UrlEncode(value)
    if state(self).class ~= "HttpService" then unsupported("UrlEncode") end
    if type(value) ~= "string" then error("UrlEncode expects a string", 2) end
    return (string.gsub(value, "[^%w%-%_%.%~]", function(c) return string.format("%%%02X", string.byte(c)) end))
end
function methodImpl:GenerateGUID(wrap)
    if state(self).class ~= "HttpService" then unsupported("GenerateGUID") end
    if wrap ~= nil and type(wrap) ~= "boolean" then error("GenerateGUID expects a boolean or nil", 2) end
    local id = string.gsub("xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx", "[xy]", function(c)
        local v = c == "x" and math.random(0,15) or math.random(8,11)
        return string.format("%x", v)
    end)
    return (wrap == nil or wrap) and ("{" .. id .. "}") or id
end

-- Simulated DataStores last only for the current sandbox run.
local dataStores = {}
function methodImpl:GetDataStore(name, scope)
    if state(self).class ~= "DataStoreService" then unsupported("GetDataStore") end
    if type(name) ~= "string" or name == "" then error("DataStore name must be a non-empty string", 2) end
    if scope ~= nil and type(scope) ~= "string" then error("DataStore scope must be a string", 2) end
    local key = (scope or "global") .. ":" .. name
    if not dataStores[key] then
        local obj = makeObject("DataStore", name)
        state(obj).store = {}
        dataStores[key] = obj
    end
    return dataStores[key]
end
local function storeFor(obj, key)
    local s = state(obj)
    if not s.store then unsupported(s.class .. " DataStore operation") end
    if type(key) ~= "string" or key == "" then error("DataStore key must be a non-empty string", 3) end
    return s.store
end
local function copyStoreValue(value, seen, depth)
    depth = depth or 0
    if depth > 100 then error("DataStore value is nested too deeply",3) end
    local kind=type(value)
    if kind == "nil" or kind == "boolean" or kind == "string" then return value end
    if kind == "number" then
        if value ~= value or value == math.huge or value == -math.huge then error("DataStore value must be finite",3) end
        return value
    end
    if kind ~= "table" or typeof(value) ~= "table" then error("DataStore value is not serializable",3) end
    seen=seen or {}
    if seen[value] then error("DataStore value cannot contain cycles",3) end
    seen[value]=true
    local result={}
    for k,v in value do
        if type(k) ~= "string" and (type(k) ~= "number" or k%1 ~= 0 or k < 1) then error("DataStore table key must be a string or positive integer",3) end
        result[k]=copyStoreValue(v,seen,depth+1)
    end
    seen[value]=nil
    return result
end
function methodImpl:GetAsync(key, nocache, headers)
    if state(self).class == "HttpService" then return httpGet(key,nocache,headers) end
    return copyStoreValue(storeFor(self, key)[key])
end
function methodImpl:SetAsync(key, value)
    local store=storeFor(self, key)
    if value == nil then error("SetAsync value cannot be nil",2) end
    store[key]=copyStoreValue(value)
end
function methodImpl:RemoveAsync(key) local store=storeFor(self, key); local old=store[key]; store[key]=nil; return copyStoreValue(old) end
function methodImpl:IncrementAsync(key, delta)
    local store=storeFor(self,key); delta = delta or 1
    if type(delta) ~= "number" or (store[key] ~= nil and type(store[key]) ~= "number") then error("IncrementAsync requires numeric values", 2) end
    store[key] = (store[key] or 0) + delta; return store[key]
end
function methodImpl:UpdateAsync(key, fn)
    local store=storeFor(self,key)
    if type(fn) ~= "function" then error("UpdateAsync expects a function", 2) end
    local new=fn(copyStoreValue(store[key])); if new ~= nil then store[key]=copyStoreValue(new) end; return copyStoreValue(new)
end

-- CollectionService tags and their local signals.
local taggedObjects = setmetatable({}, {__mode="k"})
local tagAdded, tagRemoved = {}, {}
local function requireCollection(obj)
    if state(obj).class ~= "CollectionService" then unsupported("CollectionService method") end
end
function methodImpl:AddTag(obj, tag)
    if state(self).class ~= "CollectionService" then tag=obj; obj=self else requireCollection(self); state(obj) end
    if type(tag) ~= "string" then error("tag must be a string", 2) end
    local tags=taggedObjects[obj] or {}; taggedObjects[obj]=tags
    if not tags[tag] then tags[tag]=true; if tagAdded[tag] then fire(tagAdded[tag],obj) end end
end
function methodImpl:RemoveTag(obj, tag)
    if state(self).class ~= "CollectionService" then tag=obj; obj=self else requireCollection(self); state(obj) end
    if type(tag) ~= "string" then error("tag must be a string",2) end
    local tags=taggedObjects[obj]
    if tags and tags[tag] then tags[tag]=nil; if tagRemoved[tag] then fire(tagRemoved[tag],obj) end end
end
function methodImpl:HasTag(obj, tag)
    if state(self).class ~= "CollectionService" then tag=obj; obj=self else requireCollection(self); state(obj) end
    if type(tag) ~= "string" then error("tag must be a string",2) end
    return taggedObjects[obj] ~= nil and taggedObjects[obj][tag] == true
end
function methodImpl:GetTags()
    local tags=taggedObjects[self] or {}; local result={}
    for name in tags do table.insert(result,name) end
    return result
end
function methodImpl:GetTagged(tag)
    requireCollection(self); local list={}
    for obj,tags in taggedObjects do if tags[tag] and instances[obj] and not instances[obj].destroyed then table.insert(list,obj) end end
    return list
end
function methodImpl:GetInstanceAddedSignal(tag)
    requireCollection(self); if not tagAdded[tag] then tagAdded[tag]=newSignal("CollectionService." .. tostring(tag) .. "Added") end; return tagAdded[tag]
end
function methodImpl:GetInstanceRemovedSignal(tag)
    requireCollection(self); if not tagRemoved[tag] then tagRemoved[tag]=newSignal("CollectionService." .. tostring(tag) .. "Removed") end; return tagRemoved[tag]
end
function methodImpl:FindFirstAncestor(name)
    local obj=state(self).parent
    while obj do local s=state(obj); if s.values.Name==name then return obj end; obj=s.parent end
    return nil
end
function methodImpl:FindFirstAncestorOfClass(className)
    local obj=state(self).parent
    while obj do local s=state(obj); if s.class==className then return obj end; obj=s.parent end
    return nil
end
function methodImpl:FindFirstAncestorWhichIsA(className)
    local obj=state(self).parent
    while obj do local s=state(obj); if isA(s.class,className) then return obj end; obj=s.parent end
    return nil
end
function methodImpl:FindFirstDescendant(name) return methodImpl.FindFirstChild(self, name, true) end

local services = {}
game = makeObject("DataModel", "game")
service = function(name, onlyExisting)
    if type(name) ~= "string" then error("Service name must be a string", 2) end
    local def = API[name]
    if not def then error('"' .. name .. '" is not a known mock Roblox service', 2) end
    -- The Roblox reference specifies nil for an existing class that is not a service.
    if not def.service then return nil end
    if not services[name] and not onlyExisting then
        services[name] = makeObject(name)
        if name == "HttpService" then state(services[name]).values.HttpEnabled = true end
        setParent(services[name], game)
        local dataModel = state(game)
        if dataModel.events.ServiceAdded then fire(dataModel.events.ServiceAdded, services[name]) end
    end
    return services[name]
end
workspace = service("Workspace")
state(game).values.Workspace = workspace
local players = service("Players")
if isClient then
    local player = makeObject("Player", "LocalPlayer")
    state(player).values.UserId = 0
    state(player).values.DisplayName = "LocalPlayer"
    state(players).values.LocalPlayer = player
    setParent(player, players)
    local playerGui = makeObject("PlayerGui", "PlayerGui"); setParent(playerGui, player)
    local backpack = makeObject("Backpack", "Backpack"); setParent(backpack, player)
end
script = makeObject(isClient and "LocalScript" or (__scriptType == "ModuleScript" and "ModuleScript" or "Script"), "BrowserScript")
Instance = {new = function(className, parent)
    local def = API[className]
    if not def or not def.creatable or not isA(className, "Instance") then error("Instance.new: class '" .. tostring(className) .. "' is unknown or not creatable", 2) end
    local obj = makeObject(className)
    if parent ~= nil then setParent(obj, parent) end
    return obj
end}

-- All known enum names/items from the dump, with strict lookup.
Enum = setmetatable({}, {__index = function(self, enumName)
    local def = ENUMS[enumName]
    if not def then error(tostring(enumName) .. " is not a valid Enum", 2) end
    local enumType
    enumType = setmetatable({}, {__index = function(t, itemName)
        local value = def[itemName]
        if value == nil then error(tostring(itemName) .. " is not a valid member of Enum." .. enumName, 2) end
        local item = setmetatable({}, {
            __index=function(_, key)
                if key == "Name" then return itemName end
                if key == "Value" then return value end
                if key == "EnumType" then return enumType end
                error(tostring(key) .. " is not a valid member of EnumItem", 2)
            end,
            __newindex=function() error("EnumItem is read only", 2) end,
            __tostring=function() return "Enum." .. enumName .. "." .. itemName end
        })
        mockTypes[item] = "EnumItem"
        rawset(t, itemName, item)
        return item
    end, __newindex = function() error("Enum is read only", 2) end})
    mockTypes[enumType] = "Enum"
    rawset(self, enumName, enumType)
    return enumType
end})
local function mockValueEquals(a,b)
    local kind=typeof(a)
    if kind ~= typeof(b) then return false end
    if kind == "Vector2" then return a.X == b.X and a.Y == b.Y end
    if kind == "Vector3" then return a.X == b.X and a.Y == b.Y and a.Z == b.Z end
    if kind == "Color3" then return a.R == b.R and a.G == b.G and a.B == b.B end
    if kind == "UDim" then return a.Scale == b.Scale and a.Offset == b.Offset end
    if kind == "UDim2" then return a.X == b.X and a.Y == b.Y end
    if kind == "CFrame" then
        local av={a:GetComponents()}; local bv={b:GetComponents()}
        for i=1,12 do if av[i] ~= bv[i] then return false end end
        return true
    end
    return rawequal(a,b)
end
local function vector(kind, x, y, z)
    local values = kind == "Vector2" and {X=x or 0, Y=y or 0} or {X=x or 0, Y=y or 0, Z=z or 0}
    if type(values.X) ~= "number" or type(values.Y) ~= "number" or (values.Z ~= nil and type(values.Z) ~= "number") then error(kind .. " components must be numbers", 2) end
    local function check(other)
        if typeof(other) ~= kind then error("Expected " .. kind, 3) end
    end
    local result
    result = setmetatable({}, {
        __index = function(_, key)
            if values[key] ~= nil then return values[key] end
            local magnitude = math.sqrt(values.X^2 + values.Y^2 + (values.Z or 0)^2)
            if key == "Magnitude" then return magnitude end
            if key == "Unit" then
                if magnitude == 0 then return vector(kind,0,0,0) end
                return vector(kind, values.X/magnitude, values.Y/magnitude, (values.Z or 0)/magnitude)
            end
            if key == "Dot" then return function(_, other) check(other); return values.X*other.X + values.Y*other.Y + (values.Z or 0)*(kind == "Vector3" and other.Z or 0) end end
            if key == "Cross" and kind == "Vector3" then return function(_,other) check(other); return vector(kind, values.Y*other.Z-values.Z*other.Y, values.Z*other.X-values.X*other.Z, values.X*other.Y-values.Y*other.X) end end
            if key == "Lerp" then return function(_, other, alpha) check(other); return vector(kind, values.X+(other.X-values.X)*alpha, values.Y+(other.Y-values.Y)*alpha, (values.Z or 0)+((kind == "Vector3" and other.Z or 0)-(values.Z or 0))*alpha) end end
            error(tostring(key) .. " is not a valid member of " .. kind, 2)
        end,
        __newindex = function() error(kind .. " is read only", 2) end,
        __tostring = function() return values.Z and (values.X .. ", " .. values.Y .. ", " .. values.Z) or (values.X .. ", " .. values.Y) end,
        __add = function(a,b) check(a); check(b); return vector(kind,a.X+b.X,a.Y+b.Y,kind == "Vector3" and a.Z+b.Z or 0) end,
        __sub = function(a,b) check(a); check(b); return vector(kind,a.X-b.X,a.Y-b.Y,kind == "Vector3" and a.Z-b.Z or 0) end,
        __unm = function(a) return vector(kind,-a.X,-a.Y,kind == "Vector3" and -a.Z or 0) end,
        __mul = function(a,b)
            if type(a) == "number" then a,b=b,a end
            check(a)
            if type(b) == "number" then return vector(kind,a.X*b,a.Y*b,kind == "Vector3" and a.Z*b or 0) end
            check(b); return vector(kind,a.X*b.X,a.Y*b.Y,kind == "Vector3" and a.Z*b.Z or 0)
        end,
        __div = function(a,b)
            check(a)
            if type(b) == "number" then return vector(kind,a.X/b,a.Y/b,kind == "Vector3" and a.Z/b or 0) end
            check(b); return vector(kind,a.X/b.X,a.Y/b.Y,kind == "Vector3" and a.Z/b.Z or 0)
        end,
        __eq = mockValueEquals,
    })
    mockTypes[result] = kind
    return result
end
Vector3 = {new=function(x,y,z) return vector("Vector3",x,y,z) end}
Vector3.zero = Vector3.new(0,0,0); Vector3.one = Vector3.new(1,1,1)
Vector3.xAxis=Vector3.new(1,0,0); Vector3.yAxis=Vector3.new(0,1,0); Vector3.zAxis=Vector3.new(0,0,1)
Vector2 = {new=function(x,y) return vector("Vector2",x,y) end}
Vector2.zero = Vector2.new(0,0); Vector2.one = Vector2.new(1,1)
Vector2.xAxis=Vector2.new(1,0); Vector2.yAxis=Vector2.new(0,1)
local function color(r, g, b)
    local values = {R=r or 0, G=g or 0, B=b or 0}
    if type(values.R)~="number" or type(values.G)~="number" or type(values.B)~="number" then error("Color3 expects numeric values",2) end
    local result = setmetatable({}, {
        __index=function(_, key)
            if values[key] ~= nil then return values[key] end
            if key=="Lerp" then return function(_,other,alpha)
                if typeof(other)~="Color3" or type(alpha)~="number" then error("Color3:Lerp expects Color3 and number",2) end
                return color(values.R+(other.R-values.R)*alpha,values.G+(other.G-values.G)*alpha,values.B+(other.B-values.B)*alpha)
            end end
            if key=="ToHex" then return function()
                return string.format("%02X%02X%02X",math.floor(math.clamp(values.R,0,1)*255+0.5),math.floor(math.clamp(values.G,0,1)*255+0.5),math.floor(math.clamp(values.B,0,1)*255+0.5))
            end end
            if key=="ToHSV" then return function()
                local maximum=math.max(values.R,values.G,values.B);local minimum=math.min(values.R,values.G,values.B);local delta=maximum-minimum
                local h=0
                if delta>0 then
                    if maximum==values.R then h=((values.G-values.B)/delta)%6
                    elseif maximum==values.G then h=((values.B-values.R)/delta)+2
                    else h=((values.R-values.G)/delta)+4 end
                    h=h/6
                end
                return h,maximum==0 and 0 or delta/maximum,maximum
            end end
            error(tostring(key) .. " is not a valid member of Color3", 2)
        end,
        __newindex=function() error("Color3 is read only", 2) end,
        __tostring=function() return values.R .. ", " .. values.G .. ", " .. values.B end,
        __eq=mockValueEquals,
    })
    mockTypes[result] = "Color3"
    return result
end
Color3 = {new=function(r,g,b) return color(r,g,b) end, fromRGB=function(r,g,b) return color(r/255,g/255,b/255) end}
function Color3.fromHSV(h,s,v)
    if type(h)~="number" or type(s)~="number" or type(v)~="number" then error("Color3.fromHSV expects three numbers",2) end
    h=(h%1)*6;local sector=math.floor(h);local f=h-sector
    local p=v*(1-s);local q=v*(1-f*s);local t=v*(1-(1-f)*s)
    if sector==0 then return color(v,t,p) elseif sector==1 then return color(q,v,p) elseif sector==2 then return color(p,v,t)
    elseif sector==3 then return color(p,q,v) elseif sector==4 then return color(t,p,v) else return color(v,p,q) end
end
function Color3.fromHex(hex)
    if type(hex)~="string" then error("Color3.fromHex expects a string",2) end
    hex=string.gsub(hex,"^#","")
    if #hex~=6 or not string.match(hex,"^%x%x%x%x%x%x$") then error("Color3.fromHex expects six hex digits",2) end
    return Color3.fromRGB(tonumber(string.sub(hex,1,2),16),tonumber(string.sub(hex,3,4),16),tonumber(string.sub(hex,5,6),16))
end
local function valueType(kind, values)
    local result = setmetatable({}, {
        __index = function(_, key)
            if values[key] ~= nil then return values[key] end
            error(tostring(key) .. " is not a valid member of " .. kind, 2)
        end,
        __newindex = function() error(kind .. " is read only", 2) end,
        __tostring = function()
            if kind == "UDim" then return tostring(values.Scale) .. ", " .. tostring(values.Offset) end
            if kind == "UDim2" then return tostring(values.X) .. ", " .. tostring(values.Y) end
            return kind
        end,
        __eq=mockValueEquals,
    })
    mockTypes[result] = kind
    return result
end
-- Common immutable UI value types; these provide data, not engine rendering.
Rect = {new=function(a,b,c,d)
    local min,max
    if typeof(a)=="Vector2" and typeof(b)=="Vector2" then min,max=a,b
    else min,max=Vector2.new(a,b),Vector2.new(c,d) end
    return valueType("Rect", {Min=min, Max=max, Width=max.X-min.X, Height=max.Y-min.Y})
end}
Font = {new=function(family, weight, style)
    if type(family)~="string" then error("Font.new expects a family string",2) end
    return valueType("Font", {Family=family, Weight=weight or Enum.FontWeight.Regular, Style=style or Enum.FontStyle.Normal, Bold=weight==Enum.FontWeight.Bold})
end}
NumberSequenceKeypoint={new=function(time,value,envelope)
    if type(time)~="number" or type(value)~="number" or (envelope~=nil and type(envelope)~="number") then error("NumberSequenceKeypoint expects numbers",2) end
    return valueType("NumberSequenceKeypoint", {Time=time,Value=value,Envelope=envelope or 0})
end}
ColorSequenceKeypoint={new=function(time,value)
    if type(time)~="number" or typeof(value)~="Color3" then error("ColorSequenceKeypoint expects a time and Color3",2) end
    return valueType("ColorSequenceKeypoint", {Time=time,Value=value})
end}
local function sequence(kind, a, b)
    local point=kind=="ColorSequence" and ColorSequenceKeypoint or NumberSequenceKeypoint
    local expected=kind=="ColorSequence" and "Color3" or "number"
    local points
    if type(a)=="table" and typeof(a)=="table" then
        points=table.clone(a)
        for _,v in points do if typeof(v)~=kind.."Keypoint" then error("Invalid "..kind.." keypoint",2) end end
    else
        if typeof(a)~=expected or (b~=nil and typeof(b)~=expected) then error(kind.." expects values or keypoints",2) end
        points={point.new(0,a),point.new(1,b or a)}
    end
    return valueType(kind, {Keypoints=points})
end
NumberSequence={new=function(a,b) return sequence("NumberSequence",a,b) end}
ColorSequence={new=function(a,b) return sequence("ColorSequence",a,b) end}
local warnedFalseOffset = false
UDim = {new = function(scale, offset)
    if offset == false and __winduiCompat then
        offset = 0
        if not warnedFalseOffset then warnedFalseOffset = true; output("warn", "WindUI compatibility: converted a false UDim offset to 0. Strict mode would raise an error.") end
    end
    if scale ~= nil and type(scale) ~= "number" then error("UDim scale must be a number, got " .. type(scale), 2) end
    if offset ~= nil and type(offset) ~= "number" then error("UDim offset must be a number, got " .. type(offset), 2) end
    return valueType("UDim", {Scale = scale or 0, Offset = offset or 0})
end}
UDim2 = {new = function(a,b,c,d)
    if typeof(a) == "UDim" and typeof(b) == "UDim" then return valueType("UDim2", {X=a, Y=b}) end
    return valueType("UDim2", {X=UDim.new(a,b), Y=UDim.new(c,d)})
end}
UDim2.fromScale = function(x,y) return UDim2.new(x,0,y,0) end
UDim2.fromOffset = function(x,y) return UDim2.new(0,x,0,y) end
-- A local matrix-based CFrame implementation. Physics, camera, and real
-- world simulation remain outside the browser sandbox.
local cframes=setmetatable({}, {__mode="k"})
local function cframe(position, matrix)
    local obj
    local function transformVector(v)
        return Vector3.new(matrix[1]*v.X+matrix[2]*v.Y+matrix[3]*v.Z,
            matrix[4]*v.X+matrix[5]*v.Y+matrix[6]*v.Z,
            matrix[7]*v.X+matrix[8]*v.Y+matrix[9]*v.Z)
    end
    obj=setmetatable({}, {
        __index=function(_,key)
            if key=="Position" or key=="p" then return position end
            if key=="X" then return position.X end
            if key=="Y" then return position.Y end
            if key=="Z" then return position.Z end
            if key=="RightVector" or key=="XVector" then return Vector3.new(matrix[1],matrix[4],matrix[7]) end
            if key=="UpVector" or key=="YVector" then return Vector3.new(matrix[2],matrix[5],matrix[8]) end
            if key=="LookVector" then return Vector3.new(-matrix[3],-matrix[6],-matrix[9]) end
            if key=="ZVector" then return Vector3.new(matrix[3],matrix[6],matrix[9]) end
            if key=="Rotation" then return cframe(Vector3.zero,table.clone(matrix)) end
            if key=="GetComponents" or key=="components" then return function() return position.X,position.Y,position.Z,table.unpack(matrix) end end
            if key=="Inverse" or key=="inverse" then return function()
                local r={matrix[1],matrix[4],matrix[7],matrix[2],matrix[5],matrix[8],matrix[3],matrix[6],matrix[9]}
                local p=Vector3.new(-(r[1]*position.X+r[2]*position.Y+r[3]*position.Z),-(r[4]*position.X+r[5]*position.Y+r[6]*position.Z),-(r[7]*position.X+r[8]*position.Y+r[9]*position.Z))
                return cframe(p,r)
            end end
            if key=="PointToWorldSpace" then return function(_,v) if typeof(v)~="Vector3" then error("Expected Vector3",2) end; return position+transformVector(v) end end
            if key=="VectorToWorldSpace" then return function(_,v) if typeof(v)~="Vector3" then error("Expected Vector3",2) end; return transformVector(v) end end
            if key=="PointToObjectSpace" then return function(_,v) return obj:Inverse():PointToWorldSpace(v) end end
            if key=="VectorToObjectSpace" then return function(_,v) return obj:Inverse():VectorToWorldSpace(v) end end
            if key=="ToWorldSpace" then return function(_,other) return obj * other end end
            if key=="ToObjectSpace" then return function(_,other) return obj:Inverse() * other end end
            error(tostring(key) .. " is not a supported member of mock CFrame",2)
        end,
        __mul=function(a,b)
            local sa=cframes[a]
            if typeof(b)=="Vector3" then return sa.position+transformVector(b) end
            if typeof(b)~="CFrame" then error("CFrame multiplication expects CFrame or Vector3",2) end
            local sb=cframes[b]; local p=sa.position+transformVector(sb.position); local r={}
            for row=0,2 do for col=0,2 do
                r[row*3+col+1]=sa.matrix[row*3+1]*sb.matrix[col+1]+sa.matrix[row*3+2]*sb.matrix[col+4]+sa.matrix[row*3+3]*sb.matrix[col+7]
            end end
            return cframe(p,r)
        end,
        __newindex=function() error("CFrame is read only",2) end,
        __tostring=function() return tostring(position) end,
        __eq=mockValueEquals,
    })
    mockTypes[obj]="CFrame"; cframes[obj]={position=position,matrix=matrix}
    return obj
end
CFrame = {}
function CFrame.new(x,y,z,...)
    if typeof(x)=="Vector3" then
        if typeof(y)=="Vector3" then return CFrame.lookAt(x,y) end
        if y ~= nil then error("CFrame.new: invalid argument",2) end
        return cframe(x,{1,0,0,0,1,0,0,0,1})
    end
    local p=Vector3.new(x or 0,y or 0,z or 0)
    local args={...}
    if #args==0 then return cframe(p,{1,0,0,0,1,0,0,0,1}) end
    if #args~=9 then error("CFrame.new expects 0, 3, or 12 numbers",2) end
    for _,v in args do if type(v)~="number" then error("CFrame matrix values must be numbers",2) end end
    return cframe(p,args)
end
function CFrame.Angles(x,y,z)
    if type(x)~="number" or type(y)~="number" or type(z)~="number" then error("CFrame.Angles expects three numbers",2) end
    local cx,sx=math.cos(x),math.sin(x); local cy,sy=math.cos(y),math.sin(y); local cz,sz=math.cos(z),math.sin(z)
    return cframe(Vector3.zero,{cy*cz,-cy*sz,sy,cx*sz+sx*sy*cz,cx*cz-sx*sy*sz,-sx*cy,sx*sz-cx*sy*cz,sx*cz+cx*sy*sz,cx*cy})
end
CFrame.fromEulerAnglesXYZ=CFrame.Angles
function CFrame.lookAt(at,target,up)
    if typeof(at)~="Vector3" or typeof(target)~="Vector3" or (up~=nil and typeof(up)~="Vector3") then error("CFrame.lookAt expects Vector3 arguments",2) end
    local back=(at-target).Unit; local right=(up or Vector3.yAxis):Cross(back).Unit; local top=back:Cross(right)
    return cframe(at,{right.X,top.X,back.X,right.Y,top.Y,back.Y,right.Z,top.Z,back.Z})
end
CFrame.identity=CFrame.new()
-- Provide a small, deterministic client character; it is not a simulated Roblox world.
if isClient then
    local player=state(players).values.LocalPlayer
    local character=makeObject("Model",state(player).values.Name)
    local root=makeObject("Part","HumanoidRootPart"); setParent(root,character)
    for _, name in {"Head","UpperTorso","LowerTorso","LeftUpperArm","LeftLowerArm","LeftHand","RightUpperArm","RightLowerArm","RightHand","LeftUpperLeg","LeftLowerLeg","LeftFoot","RightUpperLeg","RightLowerLeg","RightFoot"} do
        local part=makeObject("Part",name); setParent(part,character)
    end
    local humanoid=makeObject("Humanoid","Humanoid")
    local hv=state(humanoid).values
    hv.Health=100; hv.MaxHealth=100; hv.WalkSpeed=16; hv.JumpPower=50; hv.HipHeight=2
    hv.RootPart=root; hv.RigType=Enum.HumanoidRigType.R15
    setParent(humanoid,character); setParent(makeObject("Animator","Animator"),humanoid)
    state(character).values.PrimaryPart=root
    setParent(character,workspace)
    state(player).values.Character=character
end
if isClient then
    local camera=makeObject("Camera","Camera")
    state(camera).values.CFrame=CFrame.new();state(camera).values.FieldOfView=70
    state(camera).values.ViewportSize=Vector2.new(800,450);state(camera).values.CameraType=Enum.CameraType.Custom
    local player=state(players).values.LocalPlayer; local character=state(player).values.Character
    state(camera).values.CameraSubject=methodImpl.FindFirstChildOfClass(character,"Humanoid")
    setParent(camera,workspace);state(workspace).values.CurrentCamera=camera
end
TweenInfo = {new=function(time, style, direction, repeatCount, reverses, delayTime)
    if time ~= nil and (type(time) ~= "number" or time < 0) then error("TweenInfo time must be a non-negative number",2) end
    return valueType("TweenInfo", {Time=time or 1, EasingStyle=style or Enum.EasingStyle.Quad,
        EasingDirection=direction or Enum.EasingDirection.Out, RepeatCount=repeatCount or 0,
        Reverses=reverses or false, DelayTime=delayTime or 0})
end}
function methodImpl:Create(target, info, properties)
    if state(self).class ~= "TweenService" then unsupported(state(self).class .. ":Create()") end
    state(target)
    if typeof(info) ~= "TweenInfo" or type(properties) ~= "table" then error("TweenService:Create expects an Instance, TweenInfo and property table",2) end
    for key in properties do
        local p=member(state(target).class,"p",key)
        if not p or string.sub(p,1,1)=="!" then error("Cannot tween property " .. tostring(key),2) end
    end
    local tween=makeObject("Tween")
    local t=state(tween)
    t.values.Instance=target; t.values.TweenInfo=info; t.values.PlaybackState=Enum.PlaybackState.Begin
    t.tweenTarget=target; t.tweenProperties=table.clone(properties)
    return tween
end
local reportedTweenApproximation=false
function methodImpl:Play()
    local s=state(self)
    if s.class ~= "Tween" then unsupported(s.class .. ":Play()") end
    if not reportedTweenApproximation then reportedTweenApproximation=true; output("info", "Mock Tween:Play applies final properties immediately; no animation is rendered.") end
    s.values.PlaybackState=Enum.PlaybackState.Playing
    for key,value in s.tweenProperties do s.tweenTarget[key]=value end
    s.values.PlaybackState=Enum.PlaybackState.Completed
    if s.events.Completed then fire(s.events.Completed,Enum.PlaybackState.Completed) end
end
function methodImpl:Pause()
    local s=state(self); if s.class ~= "Tween" then unsupported(s.class .. ":Pause()") end
    s.values.PlaybackState=Enum.PlaybackState.Paused
end
function methodImpl:Cancel()
    local s=state(self); if s.class ~= "Tween" then unsupported(s.class .. ":Cancel()") end
    s.values.PlaybackState=Enum.PlaybackState.Cancelled
    if s.events.Completed then fire(s.events.Completed,Enum.PlaybackState.Cancelled) end
end
-- A deliberately simplified scheduler: wait yields to a worker timer; spawned
-- callbacks run synchronously, so ordering differs from the Roblox scheduler.
local schedulerWarning = false
local function schedulerNotice()
    if not schedulerWarning then output("info", "Mock task scheduler: defer runs at supported yields; spawn/delay timing may differ from Roblox."); schedulerWarning = true end
end
task = {}
function task.wait(seconds)
    if seconds == nil then seconds = 1/60 end
    if type(seconds) ~= "number" or seconds ~= seconds then error("task.wait expects a number", 2) end
    if __drainDeferred then __drainDeferred() end
    if __publishUI then __publishUI() end
    local target=math.max(seconds, 1/60)
    local elapsed=0
    repeat
        elapsed+=__wait(target-elapsed)
        if __drainUI then __drainUI() end
        if __drainDeferred then __drainDeferred() end
    until elapsed>=target
    return elapsed
end
function task.spawn(fn, ...)
    if type(fn) ~= "function" then error("task.spawn expects a function", 2) end
    schedulerNotice()
    local thread = coroutine.create(fn)
    local ok, err = coroutine.resume(thread, ...)
    if not ok then output("error", "Mock task: " .. tostring(err)) end
    return thread
end
local deferredTasks, deferredRunning = {}, false
function task.defer(fn, ...)
    if type(fn) ~= "function" then error("task.defer expects a function",2) end
    schedulerNotice()
    local thread=coroutine.create(fn)
    table.insert(deferredTasks,{thread=thread,args=table.pack(...)})
    return thread
end
function __drainDeferred()
    if deferredRunning then return end
    deferredRunning=true
    local iterations=0
    while #deferredTasks>0 and iterations<10000 do
        local queued=deferredTasks; deferredTasks={}
        for _,item in queued do
            iterations+=1
            if coroutine.status(item.thread)~="dead" then
                local ok,err=coroutine.resume(item.thread,table.unpack(item.args,1,item.args.n))
                if not ok then output("error","Mock deferred task: "..tostring(err)) end
            end
        end
    end
    if #deferredTasks>0 then output("warn","Deferred task limit reached; remaining callbacks wait for the next yield.") end
    deferredRunning=false
end
function task.delay(seconds, fn, ...)
    if type(seconds) ~= "number" or type(fn) ~= "function" then error("task.delay expects a number and function", 2) end
    task.wait(seconds)
    return task.spawn(fn, ...)
end
function task.cancel(thread)
    if type(thread) ~= "thread" then error("task.cancel expects a thread", 2) end
    if coroutine.status(thread) ~= "dead" then unsupported("task.cancel on a suspended thread") end
end
wait = task.wait
spawn = task.spawn
delay = task.delay

-- Executor APIs are a local, ephemeral simulation, never real host filesystem access.
if isExecutor then
    local files, fileURLs = {}, {}
    local folders = {[""] = true}
    local function normalize(path)
        if type(path) ~= "string" or path == "" then error("Path must be a non-empty string", 3) end
        path = string.gsub(path, "\\", "/")
        if string.sub(path, 1, 1) == "/" or string.match(path, "^%a:") then error("Absolute paths are not allowed in the mock filesystem", 3) end
        local parts = {}
        for part in string.gmatch(path, "[^/]+") do
            if part == ".." then error("Parent path traversal is not allowed", 3) end
            if part ~= "." and part ~= "" then table.insert(parts, part) end
        end
        if #parts == 0 then error("Path must not be empty", 3) end
        return table.concat(parts, "/")
    end
    local function parentPath(path) return string.match(path, "^(.*)/[^/]+$") or "" end
    function makefolder(path)
        path = normalize(path)
        local current = ""
        for part in string.gmatch(path, "[^/]+") do
            current = current == "" and part or current .. "/" .. part
            if files[current] then error("A file already exists at " .. current, 2) end
            folders[current] = true
        end
    end
    function isfolder(path) return folders[normalize(path)] == true end
    function isfile(path) return files[normalize(path)] ~= nil end
    function writefile(path, contents)
        path = normalize(path)
        if type(contents) ~= "string" then error("writefile expects string contents", 2) end
        if not folders[parentPath(path)] then error("Parent folder does not exist: " .. parentPath(path), 2) end
        if folders[path] then error("Cannot write to a folder: " .. path, 2) end
        local count = 0; for _ in files do count += 1 end
        if count >= 300 and not files[path] then error("Mock filesystem is limited to 300 files", 2) end
        files[path] = contents
        fileURLs[path] = lastHttpBody ~= nil and contents == lastHttpBody and lastHttpURL or nil
    end
    function getcustomasset(path)
        path = normalize(path)
        if files[path] == nil then error("File does not exist: " .. path, 2) end
        -- No host filesystem or Roblox content provider is exposed. If this
        -- file came directly from HTTP, preserve its URL for the separately
        -- consented browser UI-image viewer; otherwise return a placeholder.
        return fileURLs[path] or ("mockasset://" .. path)
    end
    getsynasset = getcustomasset
    function appendfile(path, contents)
        path = normalize(path)
        if type(contents) ~= "string" then error("appendfile expects string contents", 2) end
        if files[path] == nil then error("File does not exist: " .. path, 2) end
        writefile(path, files[path] .. contents)
    end
    function readfile(path)
        path = normalize(path)
        if files[path] == nil then error("File does not exist: " .. path, 2) end
        return files[path]
    end
    function listfiles(path)
        -- Fluxus documents the workspace root as the default argument.
        path = (path == nil or path == "" or path == ".") and "" or normalize(path)
        if not folders[path] then error("Folder does not exist: " .. path, 2) end
        local result = {}
        for name in folders do if name ~= path and parentPath(name) == path then table.insert(result, name) end end
        for name in files do if parentPath(name) == path then table.insert(result, name) end end
        table.sort(result)
        return result
    end
    function delfile(path)
        path = normalize(path)
        if files[path] == nil then error("File does not exist: " .. path, 2) end
        files[path] = nil
        fileURLs[path] = nil
    end
    function delfolder(path)
        path = normalize(path)
        if not folders[path] then error("Folder does not exist: " .. path, 2) end
        local prefix = path .. "/"
        for name in files do if string.sub(name, 1, #prefix) == prefix then files[name] = nil; fileURLs[name] = nil end end
        for name in folders do if name == path or string.sub(name, 1, #prefix) == prefix then folders[name] = nil end end
    end
    -- Separate fake UI container: accepts ScreenGui children without implying
    -- access to the real CoreGui or a visible Roblox display.
    local hiddenUI = makeObject("CoreGui", "MockHiddenUI")
    function gethui() return hiddenUI end
    function cloneref(obj) state(obj); return obj end
    function getgenv() return getfenv(0) end
    function getrenv() return getfenv(0) end
    local mockIdentity=8
    function getthreadidentity() return mockIdentity end
    getidentity=getthreadidentity
    get_thread_identity=getthreadidentity
    function setthreadidentity(identity)
        if type(identity)~="number" then error("setthreadidentity expects a number",2) end
        mockIdentity=identity
    end
    setidentity=setthreadidentity
    set_thread_identity=setthreadidentity
    function printidentity() output("info", "Current identity is " .. tostring(mockIdentity)) end
    function identifyexecutor() return "Luau Studio Mock", "1.0" end
    getexecutorname = identifyexecutor
    local informed = {}
    local function simulated(name, detail)
        if not informed[name] then
            informed[name] = true
            output("warn", "Executor mock: " .. name .. " " .. detail)
        end
    end
    local clipboard = ""
    function setclipboard(text)
        if type(text) ~= "string" then error("setclipboard expects a string", 2) end
        clipboard = text
        simulated("setclipboard", "stores text only in mock memory; it does not access the system clipboard.")
    end
    toclipboard = setclipboard
    function getclipboard() return clipboard end
    function getconnections(signal)
        local entries = signals[signal]
        if not entries then error("getconnections expects a mock RBXScriptSignal", 2) end
        local result = {}
        for _, entry in entries do if entry.connection.Connected then table.insert(result, entry.connection) end end
        return result
    end
    function firesignal(signal, ...)
        if not signals[signal] then error("firesignal expects a mock RBXScriptSignal", 2) end
        fire(signal, ...)
    end
    function getinstances()
        local result = {}
        for obj, info in instances do if not info.destroyed then table.insert(result, obj) end end
        return result
    end
    function getnilinstances()
        local result = {}
        for obj, info in instances do if not info.destroyed and not info.parent then table.insert(result, obj) end end
        return result
    end
    function getscripts()
        local result={}
        for obj,info in instances do
            if not info.destroyed and isA(info.class,"LuaSourceContainer") then table.insert(result,obj) end
        end
        return result
    end
    function getloadedmodules()
        simulated("getloadedmodules", "returns no modules because this sandbox does not load Roblox ModuleScripts.")
        return {}
    end
    function getreg()
        simulated("getreg", "returns a simulated empty registry, not the VM registry.")
        return {}
    end
    function getsenv(obj)
        local info=state(obj)
        if not isA(info.class,"LuaSourceContainer") then error("getsenv expects a script instance",2) end
        if obj==script then return getfenv(0) end
        return nil
    end
    function getcallingscript() return script end
    function getrawmetatable(obj) return getmetatable(obj) end
    function setrawmetatable(obj, meta)
        if type(obj) ~= "table" or (meta ~= nil and type(meta) ~= "table") then error("setrawmetatable expects a table and metatable",2) end
        local ok = pcall(setmetatable, obj, meta)
        return ok
    end
    function isreadonly(obj)
        if type(obj) ~= "table" then error("isreadonly expects a table",2) end
        return table.isfrozen(obj)
    end
    function setreadonly(obj, value)
        if type(obj) ~= "table" or type(value) ~= "boolean" then error("setreadonly expects a table and boolean",2) end
        if value then if not table.isfrozen(obj) then table.freeze(obj) end
        elseif table.isfrozen(obj) then error("The sandbox cannot unfreeze a Luau table",2) end
    end
    function make_readonly(obj) setreadonly(obj,true) end
    function make_writeable(obj) setreadonly(obj,false) end
    function fireclickdetector(detector, distance)
        local info=state(detector)
        if not isA(info.class,"ClickDetector") then error("fireclickdetector expects a ClickDetector",2) end
        if distance ~= nil and type(distance) ~= "number" then error("distance must be a number",2) end
        fire(getSignal(info,"MouseClick"), state(players).values.LocalPlayer)
    end
    function fireproximityprompt(prompt)
        local info=state(prompt)
        if not isA(info.class,"ProximityPrompt") then error("fireproximityprompt expects a ProximityPrompt",2) end
        fire(getSignal(info,"Triggered"), state(players).values.LocalPlayer)
    end
    function firetouchinterest(a, b, toggle)
        local sa,sb=state(a),state(b)
        if not isA(sa.class,"BasePart") or not isA(sb.class,"BasePart") then error("firetouchinterest expects two BaseParts",2) end
        if toggle ~= 0 and toggle ~= 1 then error("firetouchinterest toggle must be 0 or 1",2) end
        local event = toggle == 0 and "Touched" or "TouchEnded"
        fire(getSignal(sa,event), b); fire(getSignal(sb,event), a)
    end
    function rconsoleprint(message) output("print",message) end
    function rconsoleinfo(message) output("info",message) end
    function rconsolewarn(message) output("warn",message) end
    function rconsoleerr(message) output("error",message) end
    function rconsoleclear() output("info","Mock console clear requested; output history is retained.") end
    function rconsolename(title) output("info","Mock console title: " .. tostring(title)) end
    rconsoletitle = rconsolename
    function iswindowactive() return false end
    isrbxactive = iswindowactive
    function getgc(includeTables)
        simulated("getgc", "returns an empty list; real executor garbage-collector access is unavailable.")
        return {}
    end
    function checkcaller() return true end
    function newcclosure(fn)
        if type(fn) ~= "function" then error("newcclosure expects a function", 2) end
        simulated("newcclosure", "returns the original function, not a real C closure.")
        return fn
    end
    function hookfunction(target, replacement)
        if type(target) ~= "function" or type(replacement) ~= "function" then error("hookfunction expects two functions", 2) end
        simulated("hookfunction", "does not replace calls in this sandbox; it returns the original function.")
        return target
    end
    function hookmetamethod(obj, method, replacement)
        if type(method) ~= "string" or type(replacement) ~= "function" then error("hookmetamethod expects an object, name, and function", 2) end
        simulated("hookmetamethod", "cannot hook real Roblox metamethods in this sandbox.")
        return function() return nil end
    end
    function queue_on_teleport(source)
        if type(source) ~= "string" then error("queue_on_teleport expects a string", 2) end
        simulated("queue_on_teleport", "does not persist or execute code after teleport in this sandbox.")
    end
    function request(options) return httpRequest(options) end
    http_request = request
    http = {request = request}
    function loadstring(source, chunkName)
        if type(source) ~= "string" then error("loadstring expects a string", 2) end
        return __compile(source, chunkName or "loadstring")
    end
    function loadfile(path)
        return loadstring(readfile(path), "@" .. path)
    end
    -- In-memory Drawing objects validate fields but do not render to the page.
    local drawings = setmetatable({}, {__mode="k"})
    local drawingNotified = false
    local commonDrawing = {Visible=false, Color=Color3.new(1,1,1), Transparency=1}
    local shapeDefaults = {
        Line={Thickness=1, From=Vector2.new(), To=Vector2.new()},
        Text={Text="", Size=13, Center=false, Outline=false, OutlineColor=Color3.new(), Position=Vector2.new(), Font=0, TextBounds=Vector2.new()},
        Circle={Thickness=1, NumSides=32, Radius=0, Filled=false, Position=Vector2.new()},
        Square={Thickness=1, Size=Vector2.new(), Position=Vector2.new(), Filled=false},
        Triangle={Thickness=1, PointA=Vector2.new(), PointB=Vector2.new(), PointC=Vector2.new(), Filled=false},
        Quad={Thickness=1, PointA=Vector2.new(), PointB=Vector2.new(), PointC=Vector2.new(), PointD=Vector2.new(), Filled=false},
        Image={Size=Vector2.new(), Position=Vector2.new(), Data=""},
    }
    Drawing = {Fonts={UI=0,System=1,Plex=2,Monospace=3}}
    function Drawing.new(shape)
        local defaults=shapeDefaults[shape]
        if not defaults then error("Unsupported Drawing type: " .. tostring(shape),2) end
        local data=table.clone(commonDrawing)
        for key,value in defaults do data[key]=value end
        local removed=false
        local obj
        obj = setmetatable({}, {
            __index=function(_,key)
                if key=="Remove" or key=="Destroy" then return function() removed=true; drawings[obj]=nil end end
                if removed then error("Drawing object has been removed",2) end
                if data[key] ~= nil then return data[key] end
                error(tostring(key) .. " is not a valid Drawing." .. shape .. " member",2)
            end,
            __newindex=function(_,key,value)
                if removed then error("Drawing object has been removed",2) end
                if data[key] == nil then error(tostring(key) .. " is not a valid Drawing." .. shape .. " property",2) end
                if key=="TextBounds" then error("TextBounds is read only",2) end
                if typeof(value) ~= typeof(data[key]) then error(tostring(key) .. " expects " .. typeof(data[key]),2) end
                data[key]=value
            end,
            __tostring=function() return "Drawing." .. shape end,
        })
        drawings[obj]=true; mockTypes[obj]="Drawing"
        if not drawingNotified then output("info","Mock Drawing objects validate properties but do not render."); drawingNotified=true end
        return obj
    end
    function isrenderobj(obj) return drawings[obj] == true end
    function getrenderproperty(obj, key) if not drawings[obj] then error("Expected a Drawing object",2) end; return obj[key] end
    function setrenderproperty(obj, key, value) if not drawings[obj] then error("Expected a Drawing object",2) end; obj[key]=value end
    function cleardrawcache() for obj in drawings do obj:Remove() end end

    -- Lua BitOp-like convenience functions implemented using Luau's bit32.
    local UINT=4294967296
    local function uint(x) if type(x)~="number" then error("bit operation expects a number",3) end; return math.floor(x)%UINT end
    local function tobit(x) x=uint(x); return x>=2147483648 and x-UINT or x end
    bit = {
        band=bit32.band, bor=bit32.bor, bxor=bit32.bxor, bnot=bit32.bnot,
        lshift=bit32.lshift, rshift=bit32.rshift, arshift=bit32.arshift,
        rol=bit32.lrotate, ror=bit32.rrotate, tobit=tobit,
        badd=function(a,b) return (uint(a)+uint(b))%UINT end,
        nadd=function(a,b) return (uint(a)+uint(b))%UINT end,
        bsub=function(a,b) return (uint(a)-uint(b))%UINT end,
        bdiv=function(a,b) b=uint(b); if b==0 then error("division by zero",2) end; return math.floor(uint(a)/b) end,
        bmul=function(a,b)
            a=uint(a); b=uint(b)
            local al=a%65536; local ah=math.floor(a/65536); local bl=b%65536; local bh=math.floor(b/65536)
            return (al*bl + ((ah*bl+al*bh)%65536)*65536)%UINT
        end,
        bswap=function(x)
            x=uint(x); local a=bit32.band(x,255); local b=bit32.band(bit32.rshift(x,8),255)
            local c=bit32.band(bit32.rshift(x,16),255); local d=bit32.rshift(x,24)
            return bit32.bor(bit32.lshift(a,24),bit32.lshift(b,16),bit32.lshift(c,8),d)
        end,
        tohex=function(x) return string.format("%08x",uint(x)) end,
    }
    local protectedGuis = setmetatable({}, {__mode = "k"})
    syn = setmetatable({
        protect_gui = function(obj) state(obj); protectedGuis[obj] = true end,
        unprotect_gui = function(obj)
            state(obj)
            if not protectedGuis[obj] then error("GUI is not protected", 2) end
            protectedGuis[obj] = nil
        end,
        request = request,
        queue_on_teleport = queue_on_teleport,
    }, {__index = function(_, key)
        error("syn." .. tostring(key) .. " is not implemented in the browser mock", 2)
    end})
end
-- Optional compatibility for the official WindUI Studio example. This is a
-- narrowly scoped simulated module, not a general Roblox require(). It uses
-- the public distribution through the same consented HTTP bridge.
if __winduiStudioModule and isClient and not isExecutor then
    local originalRequire = require
    local winduiValue, winduiLoaded, winduiLoading
    function require(module)
        if module ~= "./src/Init" then
            if type(originalRequire)=="function" then return originalRequire(module) end
            error("This browser simulation cannot resolve the requested module: "..tostring(module),2)
        end
        if winduiLoaded then return winduiValue end
        if winduiLoading then error("Circular WindUI module load",2) end
        winduiLoading = true
        local ok, result = pcall(function()
            output("info", "WindUI Studio compatibility: loading the public WindUI distribution as ./src/Init (network permission required).")
            local source = httpGet("https://raw.githubusercontent.com/Footagesus/WindUI/main/dist/main.lua")
            -- WindUI's Studio path can still call its internal custom-asset
            -- helper for URL images. Supply module-local shims that retain the
            -- URL for the viewer; do not add executor globals to LocalScripts.
            -- Image loading itself needs the separate viewer permission.
            local shim = [=[
local __winduiLastImageURL
local http_request = function(options)
    if type(options)=="table" and type(options.Url)=="string" then
        local url=options.Url
        local image=string.match(url,"^https://repository%-images%.githubusercontent%.com/") or string.match(string.lower(url),"%.[jp][pn]g[%?]?") or string.match(string.lower(url),"%.webp[%?]?")
        if image and (options.Method==nil or options.Method=="GET") then
            __winduiLastImageURL=url
            return {Body="",Success=true,StatusCode=200,Headers={}}
        end
    end
    return game:GetService("HttpService"):RequestAsync(options)
end
local getcustomasset = function(path)
    if __winduiLastImageURL then return __winduiLastImageURL end
    return "mockasset://"..tostring(path)
end
]=]
            local fn, problem = __compile(shim .. source, "WindUI distribution")
            if not fn then error("Could not compile WindUI: " .. tostring(problem),2) end
            return fn()
        end)
        winduiLoading = false
        if not ok then error("WindUI Studio module could not load: "..tostring(result),2) end
        winduiLoaded, winduiValue = true, result
        return winduiValue
    end
end
-- UI viewer: serialize only local GUI instances, never access Roblox or the DOM.
local uiObjects, uiIds, nextUiId = {}, setmetatable({}, {__mode="k"}), 0
local function uiId(obj)
    if not uiIds[obj] then nextUiId += 1; uiIds[obj] = nextUiId end
    uiObjects[uiIds[obj]] = obj
    return uiIds[obj]
end
local function rgb(value, fallback)
    if typeof(value) == "Color3" then return {value.R, value.G, value.B} end
    return fallback
end
local function dim2(value, fallback)
    if typeof(value) == "UDim2" then return {value.X.Scale, value.X.Offset, value.Y.Scale, value.Y.Offset} end
    return fallback
end
local function vec2(value, fallback)
    if typeof(value) == "Vector2" then return {value.X, value.Y} end
    return fallback
end
local function enumName(value, fallback)
    if typeof(value) == "EnumItem" then return value.Name end
    return fallback
end
local uiCount, reportedUiLimit
local function uiNode(obj, depth)
    local s=instances[obj]
    if not s or s.destroyed or depth>24 or uiCount>=500 then return nil end
    local class=s.class
    if class ~= "ScreenGui" and not isA(class,"GuiObject") then return nil end
    uiCount+=1
    local v=s.values
    local node={id=uiId(obj),class=class,name=v.Name or class,children={},visible=v.Visible~=false,enabled=v.Enabled~=false}
    -- Hidden containers do not consume the snapshot budget. Their descendants
    -- will be serialized when a subsequent click makes the container visible.
    if not node.visible or not node.enabled then return node end
    if class~="ScreenGui" then
        node.position=dim2(v.Position,{0,0,0,0}); node.size=dim2(v.Size,{0,100,0,100})
        node.anchor=vec2(v.AnchorPoint,{0,0}); node.background=rgb(v.BackgroundColor3,{1,1,1})
        node.automaticSize=enumName(v.AutomaticSize,"None")
        node.pointerEvents = s.events.InputBegan~=nil or s.events.InputChanged~=nil or s.events.InputEnded~=nil
        node.transparency=v.BackgroundTransparency or 0; node.rotation=v.Rotation or 0
        node.z=v.ZIndex or 1; node.order=v.LayoutOrder or 0; node.clip=v.ClipsDescendants==true
        node.border=v.BorderSizePixel == nil and 1 or v.BorderSizePixel
        node.borderColor=rgb(v.BorderColor3,{0.105,0.165,0.207})
        if isA(class,"TextLabel") or isA(class,"TextButton") or isA(class,"TextBox") then
            node.text=v.Text or ""; node.textColor=rgb(v.TextColor3,{0,0,0}); node.textSize=v.TextSize or 14
            if class=="TextBox" then node.placeholder=v.PlaceholderText or ""; node.clearOnFocus=v.ClearTextOnFocus~=false; node.multiLine=v.MultiLine==true end
            node.textTransparency=v.TextTransparency or 0; node.textWrapped=v.TextWrapped==true
            node.textScaled=v.TextScaled==true; node.textX=enumName(v.TextXAlignment,"Center")
            node.textY=enumName(v.TextYAlignment,"Center"); node.font=enumName(v.Font,"Legacy")
        end
        if isA(class,"ImageLabel") or isA(class,"ImageButton") then
            node.image=v.Image or ""; node.imageTransparency=v.ImageTransparency or 0
            node.scaleType=enumName(v.ScaleType,"Stretch")
            if typeof(v.SliceCenter)=="Rect" then node.sliceCenter={v.SliceCenter.Min.X,v.SliceCenter.Min.Y,v.SliceCenter.Max.X,v.SliceCenter.Max.Y} end
            node.sliceScale=v.SliceScale or 1
            node.imageRectOffset=vec2(v.ImageRectOffset,{0,0});node.imageRectSize=vec2(v.ImageRectSize,{0,0})
            if typeof(v.ImageColor3)=="Color3" then node.imageColor=rgb(v.ImageColor3,{1,1,1}) end
        end
    end
    -- Folders are transparent containers in Roblox GUI trees. Flatten them
    -- into their nearest visual parent instead of discarding their descendants.
    local function collect(container, folderDepth)
      if folderDepth>24 then return end
      for _, child in state(container).children do
        local cs=instances[child]
        if cs and not cs.destroyed then
            if cs.class=="Folder" then
                collect(child,folderDepth+1)
            elseif cs.class=="UICorner" then
                local radius=cs.values.CornerRadius; if radius then node.corner={radius.Scale,radius.Offset} else node.corner={0,8} end
            elseif cs.class=="UIAspectRatioConstraint" and cs.values.Enabled~=false then
                local ratio=cs.values.AspectRatio or 1
                if type(ratio)=="number" and ratio>0 then node.aspectRatio=ratio;node.aspectAxis=enumName(cs.values.DominantAxis,"Width") end
            elseif cs.class=="UIStroke" and cs.values.Enabled~=false then
                node.stroke={color=rgb(cs.values.Color,{0,0,0}),thickness=cs.values.Thickness or 1,transparency=cs.values.Transparency or 0}
            elseif cs.class=="UIGradient" and cs.values.Enabled~=false then
                local cv=cs.values
                local colors,transparency={},{}
                if typeof(cv.Color)=="ColorSequence" then
                    for _,kp in cv.Color.Keypoints do table.insert(colors,{time=kp.Time,color=rgb(kp.Value,{1,1,1})}) end
                end
                if typeof(cv.Transparency)=="NumberSequence" then
                    for _,kp in cv.Transparency.Keypoints do table.insert(transparency,{time=kp.Time,value=kp.Value}) end
                end
                node.gradient={colors=colors,transparency=transparency,rotation=cv.Rotation or 0}
            elseif cs.class=="UIListLayout" then
                local cv=cs.values; local pad=cv.Padding
                node.list={direction=enumName(cv.FillDirection,"Vertical"),padding=pad and {pad.Scale,pad.Offset} or {0,0},sort=enumName(cv.SortOrder,"Name"),horizontal=enumName(cv.HorizontalAlignment,"Left"),vertical=enumName(cv.VerticalAlignment,"Top")}
            elseif cs.class=="UIPadding" then
                local cv=cs.values
                local function padding(d) return d and {d.Scale,d.Offset} or {0,0} end
                node.padding={padding(cv.PaddingTop),padding(cv.PaddingRight),padding(cv.PaddingBottom),padding(cv.PaddingLeft)}
            else
                local c=uiNode(child, depth+1); if c then table.insert(node.children,c) end
            end
        end
      end
    end
    collect(obj,0)
    return node
end
function __publishUI()
    if not __uiPost then return end
    uiObjects={}; uiCount=0
    local roots={}
    local function scan(obj, depth)
        local s=instances[obj]; if not s or s.destroyed or depth>20 or uiCount>=500 then return end
        if s.class=="ScreenGui" then local n=uiNode(obj,0); if n then table.insert(roots,n) end; return end
        for _, child in s.children do scan(child,depth+1) end
    end
    local player=state(players).values.LocalPlayer
    if player then for _, child in state(player).children do if state(child).class=="PlayerGui" then scan(child,0) end end end
    for _, name in {"CoreGui", "StarterGui"} do if services[name] then scan(services[name],0) end end
    if isExecutor and gethui then scan(gethui(),0) end
    if uiCount>=500 and not reportedUiLimit then
        reportedUiLimit=true
        output("warn", "UI viewer snapshot reached the 500-object limit; some elements may be missing.")
    end
    __uiPost(JSON.encode(roots))
end
local uiPointerInputs={}
function __uiPointer(id, phase, x, y, pointerId, touch, rectangles)
    local obj=uiObjects[id]; local s=obj and instances[obj]
    if not s or s.destroyed or not isA(s.class,"GuiObject") or type(x)~="number" or type(y)~="number" then return end
    uiMouseX,uiMouseY=x,y
    -- During pointer callbacks, use the viewer's measured rectangles. This
    -- matches hit-testing to what the user sees, including list layouts.
    previewRects={}
    if type(rectangles)=="table" then
        for _,r in rectangles do
            local element=uiObjects[r[1]]
            if element and type(r[2])=="number" and type(r[3])=="number" and type(r[4])=="number" and type(r[5])=="number" then
                previewRects[element]={position=Vector2.new(r[2],r[3]),size=Vector2.new(r[4],r[5])}
            end
        end
    end
    local input=uiPointerInputs[pointerId]
    if phase=="down" then
        input=makeObject("InputObject")
        local v=state(input).values
        v.UserInputType=touch and Enum.UserInputType.Touch or Enum.UserInputType.MouseButton1
        v.UserInputState=Enum.UserInputState.Begin
        uiPointerInputs[pointerId]=input
    elseif not input then previewRects={}; return end
    local v=state(input).values
    v.Position=Vector3.new(x,y,0)
    local inputService=services.UserInputService
    if phase=="down" then
        if s.events.InputBegan then fire(s.events.InputBegan,input) end
        if inputService and state(inputService).events.InputBegan then fire(state(inputService).events.InputBegan,input,false) end
    elseif phase=="move" then
        v.UserInputState=Enum.UserInputState.Change
        if s.events.InputChanged then fire(s.events.InputChanged,input) end
        if inputService and state(inputService).events.InputChanged then fire(state(inputService).events.InputChanged,input,false) end
        local rs=services.RunService
        if rs and state(rs).events.RenderStepped then fire(state(rs).events.RenderStepped,1/60) end
    elseif phase=="up" then
        v.UserInputState=Enum.UserInputState.End
        if s.events.InputEnded then fire(s.events.InputEnded,input) end
        if inputService and state(inputService).events.InputEnded then fire(state(inputService).events.InputEnded,input,false) end
        uiPointerInputs[pointerId]=nil
        __drainDeferred()
        __publishUI()
    end
    -- InputBegan deferrals must run before a later InputEnded, not after it.
    if phase~="up" then __drainDeferred() end
    previewRects={}
end
function __uiInput(id, text, stage, enterPressed)
    local obj=uiObjects[id]; local s=obj and instances[obj]
    if not s or s.destroyed or s.class~="TextBox" or type(text)~="string" then return end
    if stage=="focus" then
        if s.values.ClearTextOnFocus~=false then obj.Text="" end
        if s.events.Focused then fire(s.events.Focused) end
    elseif stage=="input" then
        obj.Text=text
    elseif stage=="blur" then
        if obj.Text~=text then obj.Text=text end
        if s.events.FocusLost then fire(s.events.FocusLost,enterPressed==true,nil) end
    end
    __drainDeferred()
    if stage=="blur" then __publishUI() end
end
function __uiClick(id)
    local obj=uiObjects[id]; local s=obj and instances[obj]
    if not s or s.destroyed or not isA(s.class,"GuiButton") then return end
    if s.events.MouseButton1Down then fire(s.events.MouseButton1Down) end
    if s.events.MouseButton1Up then fire(s.events.MouseButton1Up) end
    if s.events.MouseButton1Click then fire(s.events.MouseButton1Click) end
    if s.events.Activated then fire(s.events.Activated) end
    __drainDeferred()
    __publishUI()
end
function __drainUI()
    if not __nextUiEvent then return end
    while true do
        local encoded=__nextUiEvent()
        if encoded=="" then break end
        local event=JSON.decode(encoded)
        if event.type=="ui-click" then __uiClick(event.id)
        elseif event.type=="ui-input" then __uiInput(event.id,event.text,event.stage,event.enter)
        elseif event.type=="ui-pointer" then __uiPointer(event.id,event.phase,event.x,event.y,event.pointerId,event.touch,event.rectangles) end
    end
end
-- Disable Luau's safe-environment builtin optimization for this isolated VM,
-- so mock typeof overrides are observed by subsequently compiled chunks.
setfenv(0, getfenv(0))
`;
