import Message from "./messaging/mainmessage.js";
import { companyBadgeForName } from "./listing-cutover.js";

export default class JobsListing{
    constructor(postings_array, tabId, lookup){
        this.posts = postings_array;
        this.activeTabId = tabId;
        this.lookup = lookup;
        this.#iterateRequest();
    }
    #iterateRequest = async()=>{
        this.posts.forEach((post)=>{
            if(post!=null){ this.#queryCompanyName(post); }
        });
    }
    #queryCompanyName = async(post)=>{
        const badge = await companyBadgeForName(post.name, this.lookup);
        new Message(this.activeTabId, "background", "edit", {
            posts: true,
            content: {cstatus: badge, index: post.index}
        });
    }
}
