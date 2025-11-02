// 初始化聊天历史
var chatHistory = [];
var llmConfig = null;
var aiChat = [];
var requestChain = [];
var chainIndex = 0;
var llmOk = false; // 大模型可用
var chatState = 0; // 0表示空闲状态，1表示对话ing，2表示loading，3表示工具调用ing
var $chatArea = $('#chat-area');
var $sendButton = $('#send-message'); // 发送按钮的jQuery对象
var $chatInput = $('#message-input'); // 聊天输入框的jQuery对象
const chatContainer = document.querySelector('.chat-container');
const chatHeader = document.querySelector('.chat-toggle');
const chatToggle = document.getElementById('chat-toggle');
const chatInput = document.getElementById('chat-input');
const chatSend = document.getElementById('chat-send');
const chatMessages = document.getElementById('chat-messages');
// 初始化DOM元素和事件监听
function initChat(gamesData){
    llmConfig = gamesData.llm;
    initConfigUI();
    // 初始状态更新
    updateSendButtonState();

    // 最小化/最大化功能
    chatHeader.addEventListener('click', function() {
        chatContainer.classList.toggle('minimized');
    });
    // 设置发送按钮点击事件
    $sendButton.on('click', function () {
        if (chatState === 0) { // 只有在空闲状态才能发送消息
            const message = $chatInput.val().trim();
            if (message) {
                sendAIMessage(message);
                $chatInput.val('');
            }
        }
    });

    // 设置回车键发送消息
    $chatInput.on('keypress', function (e) {
        if (e.which === 13 && chatState === 0) { // 只有在空闲状态才能发送消息
            $sendButton.click();
        }
    });
}

// 更新发送按钮状态
function updateSendButtonState() {
    if ($sendButton) {
        if (chatState === 0) { // 空闲状态
            $sendButton.prop('disabled', false);
            $sendButton.css('opacity', '1');
        } else { // 对话中、加载中或工具调用中状态
            $sendButton.prop('disabled', true);
            $sendButton.css('opacity', '0.5');
        }
    }
}


// 发送消息函数
function sendAIMessage(userMessage,fn) {
    if (!userMessage) return;
    // 更改状态
    chatState = 9;
    // 添加用户消息到聊天记录
    addMessageToChat('系统', userMessage);

    // 添加用户消息到历史记录
    chatHistory.push({"role": "user", "content": userMessage});

    // 显示AI正在输入
    showTypingIndicator();

    // 使用流式API调用
    streamAPIRequest(fn);
}

// 配置管理相关函数
function getConfig() {
    return llmConfig;
}

// 默认模型列表，作为后备选项
const defaultModels = [];

// 填充模型列表
function populateModelList(selectElement, modelValue, models) {
    selectElement.empty();
    models.forEach(model => {
        const option = $('<option>').val(model.value).text(model.label);
        if (model.value === modelValue) {
            option.prop('selected', true);
        }
        selectElement.append(option);
    });
}

// 刷新模型列表函数
function refreshModelList(modelSelect, apiBaseInput, apiKeyInput, modelStatus) {
    const proxyUrl = apiBaseInput.val().trim();
    const apiKey = apiKeyInput.val().trim();

    if (!proxyUrl) {
        modelStatus.text('请先输入代理地址');
        modelStatus.css('color', '#ff6b6b');
        return;
    }

    // 显示加载状态
    modelStatus.text('正在加载模型列表...');
    modelStatus.css('color', '#4ecdc4');
    modelSelect.prop('disabled', true);

    // 构建获取模型列表的URL
    let modelsUrl = proxyUrl;
    if (!modelsUrl.endsWith('/')) {
        modelsUrl += '/';
    }
    modelsUrl += 'v1/models';

    // 发送请求获取模型列表
    $.ajax({
        url: modelsUrl,
        type: 'GET',
        headers: {
            'Authorization': `Bearer ${apiKey}`
        },
        timeout: 10000, // 10秒超时
        success: function(response) {
            // 尝试解析不同格式的响应
            let models = [];

            // 检查是否是标准OpenAI格式
            if (response.data && Array.isArray(response.data)) {
                models = response.data.map(model => ({
                    value: model.id,
                    label: model.id
                }));
            }
            // 检查是否是直接的模型数组
            else if (Array.isArray(response)) {
                models = response.map(model => ({
                    value: typeof model === 'string' ? model : model.id || model.value,
                    label: typeof model === 'string' ? model : model.name || model.label || (model.id || model.value)
                }));
            }

            if (models.length > 0) {
                // 清空并填充新的模型选项
                populateModelList(modelSelect, modelSelect.val(), models);

                modelStatus.text(`从代理获取到 ${models.length} 个模型`);
                modelStatus.css('color', '#4ecdc4');
            } else {
                // 如果没有获取到模型，使用默认模型
                populateModelList(modelSelect, modelSelect.val(), defaultModels);

                modelStatus.text('未获取到有效模型，使用默认列表');
                modelStatus.css('color', '#ffd166');
            }
        },
        error: function(xhr, status, error) {
            // 请求失败，使用默认模型
            populateModelList(modelSelect, modelSelect.val(), defaultModels);

            modelStatus.text(`获取模型失败: ${error || status}`);
            modelStatus.css('color', '#ff6b6b');
        },
        complete: function() {
            // 恢复选择框状态
            modelSelect.prop('disabled', false);
        }
    });
}

// 配置UI初始化
function initConfigUI() {
    const config = getConfig();
    const configModal = document.getElementById('config-modal');
    const configBtn = document.getElementById('chat-config-btn');
    const configCancel = document.getElementById('config-cancel');
    const configSave = document.getElementById('config-save');
    const refreshModelsBtn = document.getElementById('refresh-models');

    // 使用jQuery选择器获取元素
    const modelSelect = $('#model-select');
    const apiBaseInput = $('#api-base');
    const apiKeyInput = $('#api-key');
    const modelStatus = $('#model-status');

    // 初始化默认模型列表
    populateModelList(modelSelect, config.model, defaultModels);

    // 设置初始值
    apiBaseInput.val(config.apiBase);
    apiKeyInput.val(config.apiKey);

    // 配置按钮事件
    if (configBtn && configModal) {
        configBtn.addEventListener('click', (e) => {
            e.stopPropagation(); // 阻止冒泡，避免触发聊天框最小化
            configModal.style.display = 'flex';
            // 重新设置值
            const currentConfig = getConfig();
            apiBaseInput.val(currentConfig.apiBase);
            apiKeyInput.val(currentConfig.apiKey);

            // 确保模型选择框有值
            if (!modelSelect.val() && currentConfig.model) {
                modelSelect.val(currentConfig.model);
            }
        });
    }

    // 关闭按钮事件
    if (configCancel && configModal) {
        configCancel.addEventListener('click', () => {
            configModal.style.display = 'none';
        });
    }

    // 保存按钮事件
    if (configSave && configModal) {
        configSave.addEventListener('click', () => {
            const newConfig = {
                model: modelSelect.val(),
                apiBase: apiBaseInput.val().trim(),
                apiKey: apiKeyInput.val().trim()
            };
            llmConfig = newConfig;
            // 显示保存成功提示
            alert('大模型配置已保存！');
            llmOk = true;
            configModal.style.display = 'none';
        });
    }

    // 刷新模型列表按钮事件
    if (refreshModelsBtn) {
        refreshModelsBtn.addEventListener('click', () => {
            refreshModelList(modelSelect, apiBaseInput, apiKeyInput, modelStatus);
        });
    }

    // 点击模态框外部关闭
    if (configModal) {
        configModal.addEventListener('click', (e) => {
            if (e.target === configModal) {
                configModal.style.display = 'none';
            }
        });
    }
}

// 流式API请求函数
function streamAPIRequest(fn) {
    // 检查大模型是否可用
    if (!llmOk) {
        chatState = 0;
        updateSendButtonState();
        if(fn) fn();
        addMessageToChat('AI', '大模型不可用，请先点击右上角设置按钮正确配置代理地址、API Key和模型。');
        return;
    }

    const config = getConfig();

    // 构建请求参数
    const requestData = {
        "model": config.model,
        "messages": chatHistory,
        "temperature": 1,
        "top_p": 1,
        "stream": true,
        "stream_options": {
            "include_usage": false
        }
    };

    let aiResponse = "";
    let aiMessageElement = null;
    let toolCallDetected = false;
    let currentToolCall = "";
    let reasoningContent = "";
    let reasoningDetected = false;
    fetch(config.apiBase + "/v1/chat/completions", {
        method: "POST",
        headers: {
            "authorization": `Bearer ${config.apiKey}`,
            "content-type": "application/json"
        },
        body: JSON.stringify(requestData)
    })
        .then(response => {
            chatState = 1;
            updateSendButtonState();
            if (!response.ok) {
                chatState = 0;
                updateSendButtonState();
                if(fn){
                    fn();
                }
                throw new Error(`openai调用错误: ${response.status}`);
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();

            // 移除正在输入的指示器
            removeTypingIndicator();

            // 创建AI消息元素但不添加到DOM中，用于实时更新
            aiMessageElement = $('<div>').addClass('message ai-message');

            return reader.read().then(function processText({done, value}) {
                if (done) {
                    // 处理完所有数据
                    chatState = 0;
                    if (aiResponse.trim()) {
                        // 最终处理消息并添加到DOM
                        finalizeAiMessage(aiResponse, aiMessageElement, reasoningContent);

                        // 添加到历史记录
                        const assistantMessage = {"role": "assistant", "content": aiResponse};
                        if (reasoningContent && reasoningContent.trim()) {
                            assistantMessage.reasoning_content = reasoningContent;
                        }
                        chatHistory.push(assistantMessage);
                        if(fn){
                            fn();
                        }
                    } else {
                        addMessageToChat('AI', '抱歉，未获取到响应内容。');
                    }
                    updateSendButtonState();
                    return;
                }

                // 解码获取的数据
                const chunk = decoder.decode(value, {stream: true});

                // 分割成多行（每个事件一行）
                const lines = chunk.split('\n');

                lines.forEach(line => {
                    // 过滤空行和非事件流格式的行
                    if (line.trim() === '' || !line.startsWith('data: ')) {
                        return;
                    }

                    try {
                        // 检查是否是[DONE]消息
                        if (line.substring(5).trim() === '[DONE]') {
                            return;
                        }

                        // 移除前缀并解析JSON
                        const data = JSON.parse(line.substring(5).trim());

                        // 检查是否有finish_reason为stop或length的情况
                        if (data.choices && data.choices.length > 0 && (data.choices[0].finish_reason === 'stop' || data.choices[0].finish_reason === 'length')) {
                            return;
                        }

                        // 检查是否有内容
                        if (data.choices && data.choices.length > 0) {
                            let contentChunk = '';
                            // 检查常规内容
                            if (data.choices[0].delta.content != undefined || data.choices[0].delta.content != null) {
                                contentChunk = data.choices[0].delta.content;

                                // 累计响应内容
                                aiResponse += contentChunk;
                            }

                            // 检查是否有推理内容（用于流式响应）
                            if (data.choices[0].delta.reasoning_content != undefined || data.choices[0].delta.reasoning_content != null) {
                                reasoningContent += data.choices[0].delta.reasoning_content;
                                reasoningDetected = true;
                            }

                            // 检查是否有推理内容（用于非流式或完整响应）
                            if (data.choices[0].message && data.choices[0].message.reasoning_content) {
                                reasoningContent = data.choices[0].message.reasoning_content;
                                reasoningDetected = true;
                            }

                            // 处理工具调用检测
                            if (!toolCallDetected && aiResponse) {
                                const toolStartIndex = aiResponse.indexOf('<tool_use>');
                                if (toolStartIndex !== -1) {
                                    toolCallDetected = true;
                                    currentToolCall = contentChunk.substring(toolStartIndex - (aiResponse.length - contentChunk.length));

                                    // 显示工具调用loading状态
                                    if (aiMessageElement) {
                                        const loadingIndicator = $('<div>').attr('id', 'tool-loading').addClass('tool-loading').text('AI分配中...');
                                        aiMessageElement.append(loadingIndicator);

                                        // 检查消息元素是否已添加到DOM
                                        if (!aiMessageElement.parent().length) {
                                            $chatArea.append(aiMessageElement);
                                            $chatArea.scrollTop($chatArea[0].scrollHeight);
                                        }
                                    }
                                }
                            } else {
                                currentToolCall += contentChunk;
                                const toolEndIndex = currentToolCall.indexOf('</tool_use>');
                                if (toolEndIndex !== -1) {
                                    toolCallDetected = false;
                                    // 工具调用已完成，处理它
                                    const processedToolCall = processToolCall(currentToolCall);

                                    // 替换原始工具调用文本为处理后的HTML
                                    const responseWithoutToolCall = aiResponse.replace(currentToolCall, processedToolCall);

                                    // 移除工具调用loading状态并更新消息显示
                                    updateAiMessage(responseWithoutToolCall, aiMessageElement, reasoningContent);
                                }
                            }

                            // 如果没有工具调用或者工具调用已处理完成，更新消息显示
                            if (!toolCallDetected) {
                                updateAiMessage(aiResponse, aiMessageElement, reasoningContent);
                            }
                        }
                    } catch (error) {
                        chatState = 0;
                        console.error('解析流式响应错误:', error);
                    }
                });

                // 继续读取
                return reader.read().then(processText);
            });
        })
        .catch(error => {
            chatState = 0;
            // 移除正在输入的指示器
            removeTypingIndicator();

            // 显示错误信息
            addMessageToChat('AI', `请求失败: ${error.message}\n请确保Ollama服务已启动并在127.0.0.1:11434端口运行。`);
            console.error('API请求失败:', error);
        });
}

// 获取函数参数名称的辅助函数
function getParamNames(func) {
    try {
        // 将函数转换为字符串
        const funcStr = func.toString();

        // 提取函数参数部分
        const paramsMatch = funcStr.match(/function\s*[^(]*\(\s*([^)]*)\)/m);
        if (!paramsMatch || !paramsMatch[1]) {
            return [];
        }

        // 解析参数名并去除空白
        const paramNames = paramsMatch[1].split(',')
            .map(param => param.trim())
            .filter(param => param.length > 0);

        return paramNames;
    } catch (e) {
        console.error('获取函数参数名失败:', e);
        return [];
    }
}

// 处理工具调用的函数
function processToolCall(toolCallText) {
    try {
        // 提取工具名称和参数
        const nameMatch = toolCallText.match(/<name>(.*?)<\/name>/);
        const argsMatch = toolCallText.match(/<arguments>(.*?)<\/arguments>/);

        if (nameMatch && argsMatch) {
            const toolName = nameMatch[1];
            const argumentsStr = argsMatch[1];
            let toolJson = "";
            let targetFunction = window[toolName];
            if (typeof targetFunction === 'function') {
                try {
                    // 尝试将argumentsStr解析为JSON对象
                    const argsObj = JSON.parse(argumentsStr);

                    // 获取目标函数的参数数量
                    const argCount = targetFunction.length;

                    if (argCount === 1) {
                        // 如果函数只接受一个参数，直接传递整个参数对象
                        toolJson = targetFunction(argsObj);
                    } else {
                        // 如果函数接受多个参数，尝试从对象中提取参数
                        // 获取函数的参数名
                        const paramNames = getParamNames(targetFunction);

                        if (paramNames && paramNames.length > 0) {
                            // 准备参数数组
                            const params = paramNames.map(name => argsObj[name] || undefined);
                            // 使用动态参数调用函数
                            toolJson = targetFunction.apply(null, params);
                        } else {
                            // 如果无法获取参数名，回退到使用整个对象作为参数
                            toolJson = targetFunction(argsObj);
                        }
                    }
                } catch (e) {
                    // 如果JSON解析失败或调用出错，记录错误并使用原方式调用
                    console.error('函数调用错误:', e);
                    toolJson = targetFunction(argumentsStr);
                }
            } else {
                toolJson = "方法没有找到：" + toolName;
            }
            console.log("工具调用：", toolName, argumentsStr, "结果：", toolJson);
            // 返回处理后的HTML，添加工具调用提示
            return `<div class="tool-use">工具调用中
&lt;tool_use&gt;
&lt;name&gt;${toolName}&lt;/name&gt;
&lt;arguments&gt;${argumentsStr}&lt;/arguments&gt;
&lt;/tool_use&gt;</div>`;
        }
    } catch (error) {
        console.error('处理工具调用错误:', error);
    }

    // 如果处理失败，返回原始文本
    return toolCallText;
}

// 更新AI消息显示的函数（流式）
function updateAiMessage(content, messageElement, reasoningContent = "") {
    // 清空消息元素
    messageElement.empty();

    // 如果有推理内容，先添加到消息中
    if (reasoningContent && reasoningContent.trim()) {
        const reasoningElement = $('<div>').addClass('reasoning-content')
            .css({
                'margin-top': '10px',
                'padding': '10px',
                'background-color': '#f0f0f0',
                'border-left': '4px solid #4ecdc4',
                'border-radius': '4px',
                'font-style': 'italic',
                'color': '#333',
                'margin-bottom': '10px'
            })
            .text(`推理过程: ${reasoningContent}`);
        messageElement.append(reasoningElement);
    }

    // 添加内容（支持HTML格式，用于工具调用高亮）
    messageElement.append($('<div>').html(content));

    // 检查消息元素是否已添加到DOM
    if (!messageElement.parent().length) {
        $chatArea.append(createAIMessageElement(messageElement));
    }

    // 滚动到底部
    $chatArea.scrollTop($chatArea[0].scrollHeight);
}

// 最终处理AI消息的函数
function finalizeAiMessage(content, messageElement, reasoningContent = "") {

    // 清空消息元素
    messageElement.empty();

    // 如果有推理内容，先添加到消息中
    if (reasoningContent && reasoningContent.trim()) {
        const reasoningElement = $('<div>').addClass('reasoning-content')
            .css({
                'margin-top': '10px',
                'padding': '10px',
                'background-color': '#f0f0f0',
                'border-left': '4px solid #4ecdc4',
                'border-radius': '4px',
                'font-style': 'italic',
                'color': '#333',
                'margin-bottom': '10px'
            })
            .text(`推理过程: ${reasoningContent}`);
        messageElement.append(reasoningElement);
    }

    // 处理消息内容，提取并高亮显示工具调用
    const toolUseRegex = /<tool_use>\s*<name>(.*?)<\/name>\s*<arguments>(.*?)<\/arguments>\s*<\/tool_use>/gs;
    let match;
    let toolCalls = [];

    while ((match = toolUseRegex.exec(content)) !== null) {
        toolCalls.push({name: match[1], arguments: match[2]});
    }

    // 如果有工具调用，将其单独显示
    if (toolCalls.length > 0) {
        const contentParts = content.split(toolUseRegex);

        // 添加普通文本部分
        if (contentParts[0].trim()) {
            messageElement.append($('<div>').text(contentParts[0]));
        }

        // 添加每个工具调用
        for (let i = 0; i < toolCalls.length; i++) {
            const toolCall = toolCalls[i];
            const toolElement = $('<div>').addClass('tool-use')
                .text(`<tool_use>\n<name>${toolCall.name}</name>\n<arguments>${toolCall.arguments}</arguments>\n</tool_use>`);
            messageElement.append(toolElement);

            // 如果还有普通文本部分，添加它
            if (contentParts[i * 3 + 3] && contentParts[i * 3 + 3].trim()) {
                messageElement.append($('<div>').text(contentParts[i * 3 + 3]));
            }
        }
    } else {
        // 没有工具调用，直接添加内容
        messageElement.append($('<div>').html(content));
    }

    // 检查消息元素是否已添加到DOM
    if (!messageElement.parent().length) {
        $chatArea.append(createAIMessageElement(messageElement));
    }

    // 滚动到底部
    $chatArea.scrollTop($chatArea[0].scrollHeight);
}

function createAIMessageElement(messageElement) {
    const messageWrapper = $(`<div class="message-wrapper"></div>`);
    messageWrapper.append(`<div class="profile-picture">
                <img alt="participant" src="img/npc_dota_hero_void_spirit.gif"></div>`);
    const messageContent = $(`<div class="message-content"></div>`);
    messageContent.append(`<p class="name">HOPPINAI</p>`);
    messageContent.append(messageElement);
    messageWrapper.append(messageContent);
    return messageWrapper;
}

function addMessageToChat(sender, content, reasoningContent = "") {
    // 创建消息容器
    const messageContainer = document.createElement('div');
    messageContainer.classList.add('message-wrapper');
    messageContainer.classList.add('reverse');

    // 创建头像区域
    const profilePicture = document.createElement('div');
    profilePicture.classList.add('profile-picture');
    const img = document.createElement('img');
    img.alt = 'participant';
    img.src = 'img/npc_dota_hero_void_spirit.gif';
    profilePicture.appendChild(img);
    messageContainer.appendChild(profilePicture);

    // 创建消息内容区
    const messageElement = document.createElement('div');
    messageElement.classList.add('message-content');

    // 添加名称
    const nameElement = document.createElement('p');
    nameElement.classList.add('name');
    nameElement.textContent = sender;
    messageElement.appendChild(nameElement);

    // 创建消息文本区域
    const messageTextElement = document.createElement('div');
    messageTextElement.classList.add('message');

    if (sender === '系统' || sender === 'AI') {
        // 系统或AI消息样式
        messageTextElement.classList.add(sender === '系统' ? 'system-message' : 'user-message');

        if (sender === 'AI' && content.includes('tool_use:')) {
            // 提取工具调用部分
            const toolUseMatch = content.match(/tool_use:\s*([^\n]+)/);
            if (toolUseMatch && toolUseMatch[1]) {
                const toolUseContent = toolUseMatch[1];

                // 创建一个特殊的div来显示工具调用
                const toolCallElement = document.createElement('div');
                toolCallElement.classList.add('tool-call');
                toolCallElement.textContent = `工具调用: ${toolUseContent}`;
                messageTextElement.appendChild(toolCallElement);
            }
        }

        // 添加内容
        const contentNode = document.createTextNode(content);
        messageTextElement.appendChild(contentNode);

        // 如果有推理内容，添加到消息中
        if (reasoningContent && reasoningContent.trim()) {
            const reasoningElement = document.createElement('div');
            reasoningElement.className = 'reasoning-content';
            reasoningElement.style.marginTop = '10px';
            reasoningElement.style.padding = '10px';
            reasoningElement.style.backgroundColor = '#f0f0f0';
            reasoningElement.style.borderLeft = '4px solid #4ecdc4';
            reasoningElement.style.borderRadius = '4px';
            reasoningElement.style.fontStyle = 'italic';
            reasoningElement.style.color = '#333';
            reasoningElement.style.marginBottom = '10px';
            reasoningElement.textContent = `推理过程: ${reasoningContent}`;
            messageTextElement.appendChild(reasoningElement);
        }
    } else {
        // 用户消息
        messageTextElement.classList.add('user-message');
        const contentNode = document.createTextNode(content);
        messageTextElement.appendChild(contentNode);
    }



    // 将消息文本区域添加到消息内容区
    messageElement.appendChild(messageTextElement);

    // 将消息内容区添加到容器
    messageContainer.appendChild(messageElement);

    // 添加到聊天区域
    $chatArea.append(messageContainer);
    $chatArea.scrollTop($chatArea[0].scrollHeight);
}

// 显示AI正在输入的指示器
function showTypingIndicator() {
    chatState = 2;
    updateSendButtonState();
    const typingIndicator = $('<div>').attr('id', 'typing-indicator').addClass('typing-indicator');

    // 添加三个动画点
    for (let i = 0; i < 3; i++) {
        typingIndicator.append($('<div>').addClass('typing-dot'));
    }

    $chatArea.append(typingIndicator);
    $chatArea.scrollTop($chatArea[0].scrollHeight);
}

// 移除AI正在输入的指示器
function removeTypingIndicator() {
    chatState = 1;
    updateSendButtonState();
    $('#typing-indicator').remove();
}

/**
 * 获取提示词
 * @returns {string}
 */
function getPrompt(feature,data) {
    return prompt(getToolPrompt(), getUserPrompt(feature),data);
}

function getToolPrompt() {
    let tool = "";
    tool += `
<tool>
  <name>assign_tool</name>
  <description>将指定的物品分配进不同的分类</description>
  <arguments>
    {"type":"object","properties":{"itemId":{"type":"string","description":"物品的id"},"groupId":{"type":"string","description":"分组的id"}, "reason":{"type":"string","description":"将物品分到该分组的理由"}},"required":["itemId","groupId"],"additionalProperties":false}
  </arguments>
</tool>`
    return tool;
}

function getUserPrompt(feature) {
    let userPrompt = "";
    userPrompt += `
AI，你将扮演一个分类助手，将我给出的物品分类，你需要关注以下内容：
## 1. 核心指令
你是一个专业的物品分类AI。你的任务是根据我提供的物品特性：${feature}，将物品精准地归入以下五个类别之一。请务必严格遵循我对每个类别的定义。

## 2. 分类定义与标准

请仔细理解以下每个分类的精确含义，它们构成了一个从极优到极差的频谱：

### 夯（极好）
标准：在${feature}上都达到了近乎完美的水准，是同类物品中的标杆和典范。它不仅没有缺点，还拥有令人惊叹的突出优势。

### 顶级
标准：在${feature}上都表现得非常出色，远超普通水准。虽然可能比“夯”略逊一丝，但依然是极其优秀和可靠的选择。

### 人上人
标准：在${feature}上表现均衡且良好，没有明显短板。属于“优等生”类型，比上不足，比下有余，能提供舒适、可靠的体验。

### NPC
标准：这个名字带有“普通”或“平庸”的意味。指物品在${feature}上表现平平，勉强及格或略有不足。没有亮点，但也不算完全不能用。

### 拉完了
标准：在${feature}上存在严重缺陷，或至少有一个特性完全不及格。体验极差，属于应避免使用的“坑货”。

## 3. 工作流程与输出格式

- 接收信息：等待我提供具体的【物品名称】、${feature}。
- 分析评估：基于给定的几个特性，将该物品与上述五个分类标准进行比对。尽量让物品区分到不同分类，即不能都是夯或者NPC分类。
- 输出结果：请严格按照定义的工具输出你的分类结果，并附上简短的理由。
- 注意事项：请确保输出符合上述格式，否则会导致错误的结果。

## 4. 示例（供你理解分类标准）
### 示例1：评估一款游戏
我输入：DOTA2，特性：玩法、上手难度、机制

你可能的输出：
<tool_use>
<name>assign_tool</name>
<arguments>{"itemId": "1","groupId": "1","reason": "DOTA2是世界最好玩的游戏，因此我将其排到夯"}</arguments>
</tool_use>

### 示例2：评估一个英雄
我输入：祖安花火-泽丽，特性：英雄输出、爆发、后期强度

你可能的输出：
<tool_use>
<name>assign_tool</name>
<arguments>{"itemId": "2","groupId": "1","reason": "泽丽后期太强了"}</arguments>
</tool_use>

## 5. 最终指令
请牢记所有分类定义，保持评判标准的一致性。现在，请准备好为我提供的物品进行分类。
    `;
    return userPrompt;
}

function prompt(userTool, userPrompt, data) {
    if(userTool.length > 0){
        return `
AI，你可以使用一系列工具来回答用户的问题。您可以在每条消息中使用一个或多个工具，并将在用户的回复中收到该工具使用的结果。
您需要逐步使用工具来完成给定任务，每次工具的使用都基于前一次工具使用的结果来决策。

## 工具使用格式

工具调用使用 XML 风格的标签进行格式化。工具名称包含在开始和结束标签中，每个参数也同样包含在它自己的一组标签中。结构如下：

<tool_use>
<name>{工具名称}</name>
<arguments>{JSON格式的参数}</arguments>
</tool_use>

工具名称应是您所使用工具的确切名称，参数应是一个包含该工具所需参数的 JSON 对象。例如：
<tool_use>
<name>java_interpreter</name>
<arguments>{"code": "5 + 3 + 1294.678"}</arguments>
</tool_use>

用户将回复工具使用的结果，其格式应如下：

<tool_use_result>
<name>{工具名称}</name>
<result>{结果}</result>
</tool_use_result>

结果应是一个字符串，可以表示文件或任何其他输出类型。您可以将此结果用作下一个操作的输入。
例如，如果工具使用的结果是一个图像文件，您可以在下一个操作中像这样使用它：

<tool_use>
<name>image_transformer</name>
<arguments>{"image": "image_1.jpg"}</arguments>
</tool_use>

请始终遵循此格式来调用工具，以确保正确解析和执行。

## 工具使用示例

以下是使用假设工具的几个示例：
---
用户：生成本文档中神的图像。

助手：我可以使用 document_qa 工具来查找文档中谁是神。
<tool_use>
<name>document_qa</name>
<arguments>{"document": "document.pdf", "question": "谁是神?"}</arguments>
</tool_use>

用户：<tool_use_result>
<name>document_qa</name>
<result>hoppinzq，最伟大的神</result>
</tool_use_result>

助手：我可以使用 image_generator 工具来创建 hoppinzq 的肖像。
<tool_use>
<name>image_generator</name>
<arguments>{"prompt": "hoppinzq是神，就像上帝一样，周围都是辐光"}</arguments>
</tool_use>

用户：<tool_use_result>
<name>image_generator</name>
<result>image.png</result>
</tool_use_result>

助手：图像已生成，文件为 image.png

---
用户：“以下操作的结果是什么：5 + 3 + 1294.678？”

助手：我可以使用 java_interpreter 工具来计算该操作的结果。
<tool_use>
<name>java_interpreter</name>
<arguments>{"code": "5 + 3 + 1294.678"}</arguments>
</tool_use>

用户：<tool_use_result>
<name>java_interpreter</name>
<result>1302.678</result>
</tool_use_result>

助手：操作的结果是 1302.678。

---
用户：“广州和上海，哪个城市人口最多？”

助手：我可以使用 search 工具查找广州的人口。
<tool_use>
<name>search</name>
<arguments>{"query": "广州"}</arguments>
</tool_use>

用户：<tool_use_result>
<name>search</name>
<result>广州在2025年有2000万人</result>
</tool_use_result>

助手：我可以使用 search 工具查找上海的人口。
<tool_use>
<name>search</name>
<arguments>{"query": "上海"}</arguments>
</tool_use>

用户：<tool_use_result>
<name>search</name>
<result>上海在2025年有3000万人</result>
</tool_use_result>
助手：上海的人口是 3000 万，而广州的人口是 2000 万。因此，上海的人口最多。

## 可用工具
以上示例使用的是假设的工具，您可能无法使用。您只能使用以下工具：
<tools>
    ${userTool}
</tools>

## 工具使用规则
以下是您应始终遵循以解决任务的规则：
1.始终为工具使用正确的参数。切勿使用变量名作为操作参数，请使用具体的值。
2.仅在需要时调用工具：如果您不需要信息，请不要调用搜索代理，尝试自己解决问题。
3.如果不需要调用工具，请直接回答问题。
4.切勿使用完全相同的参数重新执行之前已执行过的工具调用。
5.对于工具调用，请确保使用如上例所示的 XML 标签格式。不要使用任何其他格式。

# 用户指令

使用用户的提示词进行回复。
${userPrompt}

# 提供了以下的数据
${data}

现在开始！如果您胜利了，您将获得 $1,000,000 的奖励。
`;
    }else{
        return `
# 用户指令
使用用户的提示词进行回复。
${userPrompt}
# 提供了以下的数据
${data}
现在开始！如果您胜利了，您将获得 $1,000,000 的奖励。
`;
    }

}