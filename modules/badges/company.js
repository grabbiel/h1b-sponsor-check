class CompanyBadge{
    constructor(nameContainer, companyStatus){
        this.container = nameContainer;
        this.#clearCache();
        this.#addBadge(companyStatus);
    }
    /**
     * Remove span and svg elements if existing
     * @param void
     * @returns void
    */
    #clearCache(){

        if(!this.container.hasChildNodes()) return;
        
        this.#removeDOMElements(this.container.getElementsByTagName("span"));
        this.#removeDOMElements(this.container.getElementsByTagName("svg"));

    }
    /**
     * Remove specific type of element if existing
     * @param HTMLDOMCollection elements_array
     * @returns void
    */
    #removeDOMElements(elements_array){
        
        if(elements_array==undefined || elements_array==null) return;
        if(elements_array.length <= 0) return;
        
        Array.from(elements_array).forEach((element)=>{
            this.container.removeChild(element);
        });

    }
    /**
     * Add JS-created badge to HTML DOM structure next to company name
     * @param int company_status
     * @returns void
    */
    #addBadge(cstatus){
        const spanSpace = document.createElement("span");
        spanSpace.innerHTML = " ";
        this.container.appendChild(spanSpace);
        this.container.appendChild(this.#createSVG(cstatus));
    }
    /**
     * Creates SVG to inject into HTML DOM structure next to company name
     * @param int company_status
     * @returns void
    */
    #createSVG(cstatus){
        const svg = document.createElementNS("http://www.w3.org/2000/svg","svg");
        svg.style.verticalAlign = "middle";
        svg.setAttribute("viewBox","0 0 18 18");
        svg.setAttribute("width","18");
        svg.setAttribute("height","18");
        svg.setAttribute("xmlns","http://www.w3.org/2000/svg");
        svg.appendChild(this.#createPath(cstatus));
        svg.addEventListener("click",e=>{
            window.scrollTo(0,0);
            this.#popupmanager();
        });
        return svg;
    }
    /**
     * Creates path to inject into HTML DOM structure next to company name
     * @param int company_status
     * @returns void
    */
    #createPath(cstatus){
        const path = document.createElementNS("http://www.w3.org/2000/svg","path");
        path.style.verticalAlign = "middle";
        if(cstatus==1){
            path.setAttribute("fill","#0FFF00");
            path.addEventListener("mouseover",e=>{
                path.setAttribute("fill","#0cb500");
            });
            path.addEventListener("mouseout",e=>{
                path.setAttribute("fill","#0fff00");
            })
            path.setAttribute("d", "M10.067.87a2.89 2.89 0 0 0-4.134 0l-.622.638-.89-.011a2.89 2.89 0 0 0-2.924 2.924l.01.89-.636.622a2.89 2.89 0 0 0 0 4.134l.637.622-.011.89a2.89 2.89 0 0 0 2.924 2.924l.89-.01.622.636a2.89 2.89 0 0 0 4.134 0l.622-.637.89.011a2.89 2.89 0 0 0 2.924-2.924l-.01-.89.636-.622a2.89 2.89 0 0 0 0-4.134l-.637-.622.011-.89a2.89 2.89 0 0 0-2.924-2.924l-.89.01-.622-.636zm.287 5.984-3 3a.5.5 0 0 1-.708 0l-1.5-1.5a.5.5 0 1 1 .708-.708L7 8.793l2.646-2.647a.5.5 0 0 1 .708.708z");
            return path;
        }else{
            path.setAttribute("fill","#FF2D00");
            path.addEventListener("mouseover",e=>{
                path.setAttribute("fill","#8f1b01");
            });
            path.addEventListener("mouseout",e=>{
                path.setAttribute("fill","#FF2D00");
            });
            path.setAttribute("d", "M11.46.146A.5.5 0 0 0 11.107 0H4.893a.5.5 0 0 0-.353.146L.146 4.54A.5.5 0 0 0 0 4.893v6.214a.5.5 0 0 0 .146.353l4.394 4.394a.5.5 0 0 0 .353.146h6.214a.5.5 0 0 0 .353-.146l4.394-4.394a.5.5 0 0 0 .146-.353V4.893a.5.5 0 0 0-.146-.353L11.46.146zm-6.106 4.5L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 1 1 .708-.708z");
            return path;
        }
    }
    /**
     * Request sponsoring data for company from background script
     * @param void
     * @returns void
    */
    #popupmanager(){
        new Messaging({origin: "popup", operation: "request", data:{full: true} });
    }
}