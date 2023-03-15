import Message from "./mainmessage.js";
import MatchRequest from "../requests/match.js";
import JobsListing from "../listing.js";
import { linkedin_content_scripts } from "../../../utilities.js";

export default class ContentMessageManager {
    constructor(tab_id, postingelement, message, sendResponse){

        this.current_tab_id = tab_id;

        if(message.operation === "submit"){

            this.manage_submit(message.data, postingelement);

        }else if(message.operation === "request"){

            this.manage_request(message, postingelement, sendResponse);

        }else if(message.operation === "resubmit"){

            this.manage_resubmit(message);

        }else if(message.operation === "injection"){
            this.manage_injection(message.data.sitename);
        }
    }
    /* ===== SUBMIT OPERATION ===== */
    manage_submit(message_data, postingelement){

        /* content submitted company's name to background posting object */
        if(message_data.name === true){
            postingelement.setCompanyName(message_data.content);
            this.submit_company_matching_request(postingelement);

        /* content submitted job description to background posting object */
        }else if(message_data.description === true){

            postingelement.setDescription(message_data.content);
            new Message(this.current_tab_id, "background", "edit", {
                jobopening: true, content: postingelement.postIsFriendly
            });

        /* content submitted set of job listings (name + idx) to background listing object */
        }else if(message_data.posts === true){
            new JobsListing(message_data.content, this.current_tab_id);
        }
    }
    
    /**
     * Query for company name within database, notify if match is found, and retrieve sponsoring data
     * @param PostingInformation posting
     * @returns void
    */
    submit_company_matching_request(postingelement){
        var instance = new MatchRequest(postingelement.companyName);
        /* check if company has a sponsoring history */
        instance.getMatch().then((response)=>{
            /* notify content script */
            new Message(
                this.current_tab_id, "background", "edit", 
                {cstatus: true, content: response}
            );
            /* company had a sponsoring history */
            if(response == 1){
                instance.getCompanyRecord(instance.string_literal).then(
                    (response)=>{ postingelement.setH1bData(response); }
                );
            /* company never sponsored */
            }else{ postingelement.setH1bData(null); }
        });
    }
    /* ===== REQUEST OPERATION ===== */
    manage_request(message, postingelement, sendResponse){
        /* content script requests company sponsoring status and job description status */
        if(message.data.cstatus === true && message.data.cdescription === true){
            sendResponse({
                cstatus: Boolean(postingelement.h1bdata),
                cdescription: postingelement.postIsFriendly
            });
        }
    }
    /* ===== INJECTION OPERATION ===== */
    manage_injection = async(sitename) =>{
        switch(sitename){
            case 1:
                await this.#injectScripts(linkedin_content_scripts);
                break;
            case 2:
                await this.#injectScripts(indeed_content_scripts);
                break;
            default:
                break;
        }
    }

    /**
     * Inject site-specific content scripts upon content script request
     * @param String[] content_scripts
     * @returns Promise
    */
    #injectScripts = async(content_scripts) =>{
        var injection_status = true;
        var self = this;
        await chrome.scripting.executeScript({
            files: content_scripts,
            target: {tabId: self.current_tab_id}
        }, function(){
            
            /* error while injecting */
            if(chrome.runtime.lastError) injection_status = false;

            /* successful injection */
            new Message(
                self.current_tab_id, "background", "set-parsing-worker",
                {set: injection_status}
            );
        });
    }

}