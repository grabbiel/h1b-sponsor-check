import MatchRequest from "./requests/match.js"; // maybe optional? test later
import Message from "./messaging/mainmessage.js"; // maybe optional? test later
export default class JobsListing{
    constructor(postings_array, tabId){
        this.posts = postings_array;
        this.activeTabId = tabId;
        this.#iterateRequest(); // delete cache after every call
    }
    #iterateRequest = async()=>{
        this.posts.forEach((post)=>{
            if(post!=null){ this.#queryCompanyName(post); }
        });
    }
    #queryCompanyName = async(post)=>{
        let instance = new MatchRequest(post.name); 
        instance.has_match().then((response)=>{
            new Message(this.activeTabId, "background", "edit", {
                posts: true,
                content: {cstatus: response, index: post.index}
            });
        })
    }
}