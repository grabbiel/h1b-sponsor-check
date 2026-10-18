function find_pack_page(pack, root){
    return pack.pages.find((page) => page.detect.some((selector) => query_one(root, selector) !== null)) ?? null;
}
function find_slot(root, page, slot){
    for(const selector of page.slots[slot]){
        const found = query_one(root, selector);
        if(found !== null) return found;
    }
    return null;
}
function find_slot_all(root, page, slot){
    for(const selector of page.slots[slot]){
        const found = query_all(root, selector);
        if(found.length > 0) return found;
    }
    return [];
}
// Remote packs are parsed without a DOM, so a selector the browser rejects only surfaces here.
function query_one(root, selector){
    try{
        return root.querySelector(selector);
    }catch{
        return null;
    }
}
function query_all(root, selector){
    try{
        return Array.from(root.querySelectorAll(selector));
    }catch{
        return [];
    }
}
