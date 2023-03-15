class PopUpManager{
    constructor(companyname, jobstatus, h1bdata){
        this.visarequestcontainer = null;
        this.h1bdata = h1bdata;
        this.cname = companyname;

        this.container = null;
        this.loadingpage = null;

        this.topbtncontainer = null;
        this.closebtn = null;
        this.returnbtn = null;
        
        this.textcontainer = null;
        this.summarymode = null;
        this.extendedmode = null;
        this.leavingmode = null;
        this.paragraph = null;
        
        this.bottombtncontainer = null;
        this.donatebtn = null;
        this.feedbackbtn = null;
        this.refusebtn = null;
        this.leavebtn = null;

        this.#initial_fetch(companyname, jobstatus, h1bdata);
    }
    #initial_fetch = async(companyname, jobstatus, h1bdata) =>{
        if(document.getElementById("popup-container")){
            // do nothing leave the planet!
        }else{
            await fetch(chrome.runtime.getURL("modules/popup/html/container.html")).then(
                (containerhtml)=>containerhtml.text()).then((txt)=>{
                    document.body.firstElementChild.insertAdjacentHTML('afterend',txt);
                    this.container = document.getElementById("popup-container");
                    this.topbtncontainer = document.getElementById("popup-top-btns-container");
                    this.textcontainer = document.getElementById("popup-main-text");
                    this.bottombtncontainer = document.getElementById("popup-bottom-btns-container");
                    this.#set_loading_phase().then(()=>{
                        this.set_summary_text(companyname, jobstatus, h1bdata);
                        this.#set_landing_page();
                    });
            });
        }
    }
    #set_loading_phase = async() =>{
        this.loadingpage = new LoadPage(this.container);
    }
    #set_landing_page = async() =>{
        this.#get_close_button().then(()=>{
            this.#insert_main_text().then(()=>{
                this.visarequestcontainer = document.getElementById("popup-visa-requests");
                if(this.visarequestcontainer){
                    this.visarequestcontainer.querySelector("a").addEventListener("click",e=>{
                        e.preventDefault();
                        if(this.returnbtn){
                            this.returnbtn.remove();
                        }
                        this.#set_expanded_page();
                        return false;
                    });
                }
                this.#insert_bottom_buttons().then(()=>{
                    this.loadingpage.remove();
                }); 
            });
        });
    }
    #get_close_button = async() =>{
        await fetch(chrome.runtime.getURL("modules/popup/html/buttons/closeBtn.html")).then(
        (html)=>html.text()).then((txt)=>{
            this.topbtncontainer.firstElementChild.insertAdjacentHTML('afterend',txt);
            this.closebtn = document.getElementById("popup-close-btn");
            this.closebtn.addEventListener("click",e=>{
                this.#clear();
                return false;
            });
        });
    }
    #get_return_button = async() =>{
        await fetch(chrome.runtime.getURL("modules/popup/html/buttons/returnBtn.html")).then((html)=>html.text()).then((txt)=>{
            this.topbtncontainer.firstElementChild.insertAdjacentHTML('beforebegin',txt);
            this.returnbtn = document.getElementById("popup-return-btn");
            this.returnbtn.addEventListener("click",e=>{
                this.summarymode.querySelector("p").innerHTML = "";
                this.closebtn.remove();
                this.donatebtn.remove();
                this.feedbackbtn.remove();
                if(this.refusebtn){
                    this.refusebtn.remove();
                }
                if(this.leavebtn){
                    this.leavebtn.remove();
                }
                this.returnbtn.remove();
                this.#set_loading_phase().then(()=>{
                    this.#set_landing_page();
                });
            });
        });
    }
    #insert_bottom_buttons = async() =>{
        this.#get_donate_button().then(()=>{
            this.#get_feedback_button();
        });
    }
    #get_donate_button = async() =>{
        await fetch(chrome.runtime.getURL("modules/popup/html/buttons/donateBtn.html")).then(
            (html)=>html.text()).then((txt)=>{
                this.bottombtncontainer.firstElementChild.insertAdjacentHTML('beforebegin',txt);
                this.donatebtn = document.getElementById("popup-donate-btn");
                this.donatebtn.addEventListener("click",e=>{
                    if(this.returnbtn){
                        this.returnbtn.remove();
                    }
                    this.#set_leaving_page(true);
                });
        });
    }
    #get_feedback_button = async() =>{
        await fetch(chrome.runtime.getURL("modules/popup/html/buttons/feedbackBtn.html")).then(
            (html)=>html.text()).then((txt)=>{
                this.bottombtncontainer.firstElementChild.insertAdjacentHTML('afterend',txt);
                this.feedbackbtn = document.getElementById("popup-feedback-btn");
                this.feedbackbtn.addEventListener("click",e=>{
                    if(this.returnbtn){
                        this.returnbtn.remove();
                    }
                    this.#set_leaving_page(false);
                });
        });
    }
    #insert_main_text = async() =>{
        await fetch(chrome.runtime.getURL("modules/popup/html/text/summary.html")).then(
            (html)=>html.text()).then((txt)=>{
                this.textcontainer.firstElementChild.insertAdjacentHTML('afterend',txt);
                this.summarymode = document.getElementById("popup-text-short");
                this.summarymode.querySelector("p").innerHTML = this.paragraph;
            });
    }
    #set_leaving_page = async(donation) =>{
        this.closebtn.remove();
        this.feedbackbtn.remove();
        this.donatebtn.remove();
        this.summarymode.querySelector("p").innerText = "you are about to leave this page";
        this.#get_leave_button(donation).then(()=>{
            this.#get_refuse_button();
        });
        
    }
    #get_leave_button = async(donation) =>{
        if(donation){
            this.leavebtn = document.createElement("a");
            this.leavebtn.style.textDecoration = "none";
            this.leavebtn.style.color = "inherit";
            this.leavebtn.href = "https://donate.stripe.com/bIYg0A5EidqVa7C6op";
            this.leavebtn.target = "_blank";
            let btn = document.createElement("button");
            btn.style.textAlign = "center";
            this.leavebtn.appendChild(btn);
        }else{
            this.leavebtn = document.createElement("button");
        }
        this.leavebtn.style.margin = "auto";
        this.leavebtn.style.marginTop = "5%";
        this.leavebtn.style.padding = "1%";
        this.leavebtn.style.height = "50%";
        this.leavebtn.style.width = "20%";
        this.leavebtn.style.backgroundColor = "white";
        this.leavebtn.innerText = "Ok";
        this.bottombtncontainer.firstElementChild.insertAdjacentElement('beforebegin',this.leavebtn);
    }
    #get_refuse_button = async() =>{
        await fetch(chrome.runtime.getURL("modules/popup/html/buttons/refuseBtn.html")).then(
            (html)=>html.text()).then((txt)=>{
                this.bottombtncontainer.firstElementChild.insertAdjacentHTML('afterend',txt);
                this.refusebtn = document.getElementById("popup-refuse-btn");
                this.refusebtn.addEventListener("click",e=>{
                    this.summarymode.querySelector("p").innerHTML = "";
                    this.#reset_landing_page();
                });
        });
    }
    #reset_landing_page = async() =>{
        this.refusebtn.remove();
        this.leavebtn.remove();
        this.#set_loading_phase().then(()=>{
            this.#set_landing_page();
        });
    }
    #set_expanded_page = async() =>{
        this.summarymode.querySelector("p").innerHTML = "";
        this.#get_return_button().then(()=>{
            this.summarymode.querySelector("p").innerHTML = `Last year, <span style='color: yellow;'>${this.cname}</span> filled out <span style='font-weight:bold;'>${this.h1bdata.company_requests} LCAs</span> and submitted them to the USCIS either to continue the employment of a current worker or employ a new international applicant. Out of these ${this.h1bdata.company_requests} requests, <span style='font-weight:bold;'>USCIS approved ${this.h1bdata.company_approvals}.</span>`;
        });
    }
    #clear(){
        document.body.removeChild(this.container);
    }

    set_summary_text = async(cname, cstatus, h1bdata) =>{
        if(h1bdata!=null && cstatus){
            this.paragraph  = `This job opening is willing to sponsor international applicants. In the past year, <span style='color: yellow;'>${cname}</span> has requested <span id='popup-visa-requests' style='font-weight: bold;'><a title='What is this?' style='text-decoration:none;'>${h1bdata.company_requests} H1B visas</a></span>, thus positioning itself in the ${this.#company_ranking(h1bdata.company_ranking)} of sponsoring employers.`;
        }else if(h1bdata==null && cstatus === false){
            this.paragraph  = `Yeah... you probably should not even consider this position. \nNot only does it disencourage non-citizens' applications but also, according to our records, <span style='color: yellow;'>${cname}</span> has not filed a single H1B request in recent years.\nKeep looking! We know you got this!`;

        }else if(h1bdata==null){
            this.paragraph  = `Although this job opening does not explicitly reject international applications, we do not think this position might be your best shot.\n\nOur records show <span style='color: yellow;'>${cname}</span> does not have a recent history of H1B sponsoring.`;
        }else if(cstatus == false){
            this.paragraph  = `Although this particular job opening does not sponsor international applicants, <span style='color: yellow;'>${cname}</span> does have a recent history of H1B visa sponsoring. Last year, they filed <span id='popup-visa-requests' style='font-weight: bold;'><a title='What is this?' style='text-decoration:none;'>${h1bdata.company_requests} visa requests</a></span>, thus positioning themselves in the ${this.#company_ranking(h1bdata.company_ranking)} of sponsoring employers.`;
        }
    }
    #company_ranking(ranking){
        var position = "top ";
        if(ranking < 11){
            position+=10;
        }else if(ranking < 26){
            position+=25;
        }else if(ranking < 51){
            position+=50;
        }else if(ranking < 101){
            position+=100;
        }else if(ranking < 251){
            position+=250;
        }else if(ranking < 501){
            position+=500;
        }else if(ranking < 1001){
            position+=1000;
        }else if(ranking < 10001){
            position+="10k";
        }else if(ranking < 25001){
            position = "25k";
        }
        return position;
    }
}