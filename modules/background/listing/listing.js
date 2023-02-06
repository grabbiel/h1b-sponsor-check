import MatchRequest from "../requests/match.js"; // maybe optional? test later
import Message from "../messaging/mainmessage.js"; // maybe optional? test later
export default class JobsListing{
    constructor(postings_array, tabId){
        this.posts = postings_array;
        this.activeTabId = tabId;
        this.#iterateRequest();
    }
    #iterateRequest = async()=>{
        this.posts.forEach((post)=>{
            if(post!=null){
                this.#queryCompanyName(post);
            }
        });
    }
    #queryCompanyName = async(post)=>{
        let instance = new MatchRequest(post.name); 
        instance.matching().finally(()=>{
            new Message(this.activeTabId, "background", "edit", {
                posts: true,
                content: {cstatus: instance.match_found, index: post.index}
            });
        })
    }
}