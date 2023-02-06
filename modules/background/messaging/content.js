import Message from "./mainmessage.js";
import MatchRequest from "../requests/match.js";
import JobsListing from "../listing/listing.js";
export default class Content{
    constructor(tabId, postingelement, message, sendResponse){
        this.current_tab_id = tabId;
        if(message.operation === "submit"){
            this.manage_submit(message, postingelement);
        }else if(message.operation === "request"){
            this.manage_request(message, postingelement, sendResponse);
        }else if(message.operation === "resubmit"){
            this.manage_resubmit(message);
        }
    }
    manage_submit(message, postingelement){
        if(message.data.name === true){
            postingelement.setCompanyName(message.data.content);
            this.submit_company_matching_request(postingelement);
        }else if(message.data.description === true){
            postingelement.setDescription(message.data.content);
            new Message(this.current_tab_id, "background", "edit", {
                jobopening: true, content: postingelement.postIsFriendly
            });
        }else if(message.data.posts === true){
            new JobsListing(message.data.content, this.current_tab_id);
        }
    }
    submit_company_matching_request(postingelement){
        let instance = new MatchRequest(postingelement.companyName);
        instance.matching().finally(()=>{
            new Message(this.current_tab_id, "background", "edit", {
                cstatus: true, content: instance.match_found
            });
            if(instance.match_found){
                instance.getCompanyRecord(instance.string_literal).finally(()=>{
                    postingelement.setH1bData(instance.json_temp);
                    instance.clearCache();
                });
            }else{
                postingelement.setH1bData(null);
            }
        });
    }
    manage_request(message, postingelement, sendResponse){
        if(message.data.cstatus === true && message.data.cdescription === true){
            if(postingelement.h1bdata != null){
                sendResponse({
                    cstatus: true,
                    cdescription: postingelement.postIsFriendly
                });
            }else{
                sendResponse({
                    cstatus: false,
                    cdescription: postingelement.postIsFriendly
                });
            }
        }
    }
    manage_resubmit(message){

    }
}