class IndeedWorker extends GeneralParsingWorker{ // extend parent
    constructor(){
        super();
    }
    set_method(pack){
        parsing = true;
        this.documentbody = document.body;
        const page = pack === null ? null : find_pack_page(pack, this.documentbody);
        if(page === null) return;
        this.jobposting = new SlotPage(this.documentbody, page);
        if(page.kind === "search") this.searchresults = new PostingsListing(this.documentbody, page);
        else{
            this.clear_search_cache();
            for(const holder of [this.jobposting.positionholder, this.jobposting.nameholder]){
                if(holder !== null) holder.style.display = "flex";
            }
        }
        this.jobposting.submit();
    }
}
