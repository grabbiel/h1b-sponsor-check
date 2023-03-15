import Message from "./mainmessage.js";
export default class PopupMessageManager{
    constructor(tab_id, postingelement, message, sendResponse){

        this.current_tab_id = tab_id;

        if(message.operation === "submit"){

            this.manage_submit(message, postingelement);

        }else if(message.operation === "request"){

            this.manage_request(message.data, postingelement, sendResponse);

        }else if(message.operation === "create"){

            this.manage_create(message);

        }
    }
    manage_submit(message, postingelement){}
    manage_request(message_data, postingelement, sendResponse){
        /* content scripts requests all relevant data to particular job posting */
        if(message_data.full === true){
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