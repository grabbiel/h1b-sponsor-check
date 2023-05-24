import Message from "./mainmessage.js";
import MatchRequest from "../requests/match.js";
import MatchReviewRequest from "../requests/review.js";
import JobsListing from "../listing.js";
import {
  linkedin_content_scripts,
  indeed_content_scripts,
  platform_codes_by_worker
} from "../../../utilities.js";


export default class Content {
  constructor(tabId, postingelement, message, sendResponse) {
    this.current_tab_id = tabId;

    if (message.operation === "submit") {
      // Handle submit operation
      this.manage_submit(message, postingelement);
    } else if (message.operation === "request") {
      // Handle request operation
      this.manage_request(message, postingelement, sendResponse);
    } else if (message.operation === "resubmit") {
      // Handle resubmit operation
      this.manage_resubmit(message);
    } else if (message.operation === "injection") {
      // Handle injection operation
      this.manage_injection(message.data.sitename);
    }
  }
  manage_submit(message, postingelement) {
    // Handle submit operation

    if (message.data.name === true) {
      // If company name is true, set the company name and submit a company matching request
      postingelement.setCompanyName(message.data.content);
      this.submit_company_matching_request(postingelement);
    } else if (message.data.description === true) {
      // If description is true, set the description and send a message to the background to edit the job opening
      postingelement.setDescription(message.data.content);
      new Message(this.current_tab_id, "background", "edit", {
        jobopening: true,
        content: postingelement.postIsFriendly,
      });
    } else if (message.data.posts === true) {
      // If posts is true, create a new JobsListing instance with the content
      new JobsListing(message.data.content, this.current_tab_id);
    } else if(message.data.parsingworkerClass === true){
        postingelement.setPlatform(message.data.content.platform_code);
        postingelement.setCountry(0); // MODIFY LATER
    }
  }

  submit_company_matching_request(postingelement) {
    // Submit a company matching request

    let instance = new MatchRequest(postingelement.companyName);
    instance.get_match().then((response) => {
      new Message(this.current_tab_id, "background", "edit", {
        cstatus: true,
        content: response,
      });

      if (response == 1) {
        instance.getCompanyRecord(instance.string_literal).then((response) => {
          postingelement.setH1bData(response);
        });
        
        this.submit_match_review_request(postingelement, instance.string_literal);        

      } else postingelement.setH1bData(null);
    });
  }

  submit_match_review_request = async (postingelement, string_literal) =>{
    let instance = new MatchReviewRequest(postingelement.companyName, postingelement.platform, postingelement.country, string_literal);
    instance.runProcess();
  }

  manage_request(message, postingelement, sendResponse) {
    // Handle request operation

    if (message.data.cstatus === true && message.data.cdescription === true) {
      // If cstatus and cdescription are true, send a response with the company status and description
      sendResponse({
        cstatus: Boolean(postingelement.h1bdata),
        cdescription: postingelement.postIsFriendly,
      });
    }
  }

  manage_injection = async (sitename) => {
    switch (sitename) {
      case 1:
        await this.#injectScripts(linkedin_content_scripts);
        break;
      case 2:
        await this.#injectScripts(indeed_content_scripts);
        break;
      default:
        break;
    }
  };

  #injectScripts = async (contentScripts) => {
    var injectionStatus = true;
    var self = this;
    await chrome.scripting.executeScript(
      {
        files: contentScripts,
        target: { tabId: self.current_tab_id },
      },
      function () {
        if (chrome.runtime.lastError) injectionStatus = false;
        new Message(self.current_tab_id, "background", "set-parsing-worker", {
          set: injectionStatus,
        });
      }
    );
  };
}
