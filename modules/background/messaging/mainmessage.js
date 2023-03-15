export default class Message{
    constructor(tab_id, origin, operation, data){
        chrome.tabs.sendMessage(tab_id, {
            origin: origin,
            operation: operation,
            data: data
        });
    }
}