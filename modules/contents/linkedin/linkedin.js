class LinkedinWorker extends GeneralParsingWorker{ // extend parent
    constructor(){
        super();
    }
    set_method(pack){
        this.documentbody = document.body;
        const page = pack === null ? null : find_pack_page(pack, this.documentbody);
        if(page === null) return;
        if(page.kind === "search") this.searchresults = new PostingsListing(this.documentbody, page);
        else this.clear_search_cache();
        this.jobposting = new SlotPage(this.documentbody, page);
        this.jobposting.positionholder?.closest("a")?.addEventListener("click", (clickEvent)=>{
            clickEvent.stopPropagation();
        });
        this.jobposting.submit();
        if(this.jobposting.cname === "" && this.searchresults !== null){
            new Messaging({origin: "content", operation: "submit", data:{
                name: true,
                content: this.get_listing_active_company_name()
            }});
        }
    }
}
