import MatchRequest from "./requests/match.js";
import Message from "./messaging/mainmessage.js";

export default class JobsListing{
    constructor(postings_array, tab_id){
        this.posts = postings_array;
        this.activeTabId = tab_id;
        this.#iterateRequest(); // delete cache after every call
    }
    #iterateRequest = async()=>{
        this.posts.forEach((post)=>{
            if(post!=null){ this.#queryCompanyName(post); }
        });
    }
    #queryCompanyName = async(post)=>{
        let instance = new MatchRequest(post.name); 
        instance.hasMatch().then((response)=>{
            new Message(this.activeTabId, "background", "edit", {
                posts: true,
                content: {cstatus: response, index: post.index}
            });
        })
    }
}