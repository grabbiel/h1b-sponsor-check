import Message from "./mainmessage.js";
export default class Popup{
    constructor(tabId, postingelement, message, sendResponse){
        this.current_tab_id = tabId;
        if(message.operation === "submit"){
            this.manage_submit(message, postingelement);
        }else if(message.operation === "request"){
            this.manage_request(message, postingelement, sendResponse);
        }else if(message.operation === "resubmit"){
            this.manage_resubmit(message);
        }else if(message.operation === "create"){
            this.manage_create(message);
        }
    }
    manage_submit(message, postingelement){}
    manage_request(message, postingelement, sendResponse){
        if(message.data.full === true){
            new Message(this.current_tab_id, "background", "create", {
                popup: true, content:{
                    cname: postingelement.companyName,
                    cdescription: postingelement.postIsFriendly,
                    h1bdata: postingelement.h1bData
                }
            });
        }
    }
    manage_create(message){}
}