class SortAndDrop {
    static instances = [];
    static debug = false;

    direction = "row";
    threshold = 25;
    thresholdMove = 50;

    constructor(list, options = {}) {
        Object.assign(this, options);
        if(!options.selectArea) {
            this.selectableArea = list;
        } else {
            const selectableArea = list.closest(options.selectArea);
            if(!selectableArea) this.selectableArea = list;
            else this.selectableArea = selectableArea;
        }
        list.classList.add("sad-list");
        this.from = list;
        const events = ["mousedown", "touchstart", "mouseup", "touchend", "mousemove", "touchmove"];
        events.forEach(type => {
            document.addEventListener(type, (e) => {
                const target = e.target.closest(".sad-item");
                const list = e.target.closest(".sad-list");
                const rect = this.from.getBoundingClientRect();
                this.fromRect = {
                    top:        rect.top,
                    left:       rect.left,
                    width:      rect.width,
                    height:     rect.height
                };
                switch(type) {
                    case "mousedown":
                        if(e.button != 0) return;
                    case "touchstart":
                        if(!target || target.parentNode != this.from) {
                            if(
                                e.target.closest(options.selectArea) === this.selectableArea &&
                                SortAndDrop.instances.find(el => el.from === list) === this
                            ) {
                                if(!e.ctrlKey)
                                    this.#UnselectAll();
                                if(!this.selectPlaceholder) this.#CreateSelectablePlaceholder();
                                this.#SelectStart(e);
                            }
                            return;
                        }
                        this.#Down(e, target);
                    break;
                    case "mouseup":
                    case "touchend":
                        if(this.selecting) this.#SelectEnd(e);
                        else this.#Up(e);
                    break;
                    case "touchmove":
                    case "mousemove":
                        if(this.selecting) this.#SelectMove(e);
                        else {
                            if(!this.relatedElement) return;
                            e.preventDefault();
                            if(this.relatedElement.parentNode != this.from) return;
                            this.#Move(e);
                        }
                    break;
                }
            }, {passive:false});
        });
        [...list.children].forEach(el => el.classList.add("sad-item"));
        list.addEventListener("DOMNodeInserted", (e) => {
            if(![...list.children].includes(e.target)) return;
            e.target.classList.add("sad-item");
            if(this.droppable) {
                const elements = list.querySelectorAll(this.droppable);
                [...elements].forEach(el => el.classList.add("sad-droppable"));
            }
        });


        if(this.droppable) {
            const elements = list.querySelectorAll(this.droppable);
            [...elements].forEach(el => el.classList.add("sad-droppable"));
        }
        SortAndDrop.instances.push(this);
    }

    #Down(e, target) { // MOUSE DOWN OR TOUCH START
        this.downTimestamp = new Date().getTime();
        //this.selectedTimeout = setTimeout(() => this.#SelectItem(e, target), 250);
        this.relatedElement = target;
        const rect = target.getBoundingClientRect();
        this.relatedRect = {
            top:        rect.top,
            left:       rect.left,
            width:      rect.width,
            height:     rect.height,
            absTop:     e.pageY || e.touches[0].pageY,
            absLeft:    e.pageX || e.touches[0].pageX,
            relTop:     (e.pageY || e.touches[0].pageY) - rect.top,
            relLeft:    (e.pageX || e.touches[0].pageX) - rect.left
        }
        this.downTop = e.pageY || e.touches[0].pageY;
        this.downLeft = e.pageX || e.touches[0].pageX;
        if(!target.className.includes("sad-selected"))
            this.#UnselectAll();
        this.#Debug();
    }
    #Move(e) { // MOUSE MOVE OR TOUCH MOVE
        let ghostRatio = 0.75;
        if(!this.targetElement) {
            const area = {
                top:this.downTop - (this.thresholdMove / 2),
                left:this.downLeft - (this.thresholdMove / 2),
                width:this.thresholdMove,
                height:this.thresholdMove
            }
            const cursorTop = e.pageY || e.touches[0].pageY;
            const cursorLeft = e.pageX || e.touches[0].pageX;
            if(cursorTop > area.top && cursorLeft > area.left && cursorTop < (area.top + area.height) && cursorLeft < (area.left + area.width))
                return;
        } else {
            this.targetRect = this.targetElement.getBoundingClientRect();
            ghostRatio = Math.abs(this.targetRect.width / this.relatedRect.width) / 100 * 75;
        }

        if(!this.ghost) this.#CreateGhost();

        let movementX = e.movementX;
        if(e.changedTouches)
            movementX = (e.touches[0].pageX - this.cursorX) || 0
        let rotateTransform = `rotate(${movementX > 0 ? "" : "-"}30deg)`;
        let newTransform = this.ghost.style.transform.replace(/rotate\(.+\)/, ``) + ` ${rotateTransform}`;
        if(!newTransform.includes(`scale(${ghostRatio})`))
            newTransform = newTransform.replace(/scale\(.+\)/, ``) + ` scale(${ghostRatio})`;

        Object.assign(this.ghost.style, {
            "left":  this.cursorX - (this.relatedRect.width / 2) + "px",
            "top":  this.cursorY - (this.relatedRect.height / 2) + "px",
            "transform": newTransform
        });
        this.ghostAnimation = setTimeout(() => {
            if(this.ghost)
                this.ghost.style.transform = this.ghost.style.transform.replace(rotateTransform, "");
            clearTimeout(this.ghostAnimation);
            delete this.ghostAnimation;
        }, 300);

        this.selected = this.from.querySelectorAll(".sad-selected:not(.sad-ghost)");
        this.cursorX = (e.pageX || e.touches[0].pageX);
        this.cursorY = (e.pageY || e.touches[0].pageY);
        clearTimeout(this.selectedTimeout);
        delete this.selectedTimeout;

        if(this.relatedElement)
            [...(this.selected || []), this.relatedElement].forEach(el => Object.assign(el.style, {
                "opacity":"0.5"
            }));

        this.scrollableElement = this.#getScrollParent();
        this.#Scroll();
        
        const target = document.elementFromPoint((e.pageX || e.touches[0].pageX) - window.scrollX, (e.pageY || e.touches[0].pageY) - window.scrollY).closest(".sad-item");
        if(target) {
            this.targetElement = target;
            const rect = target.getBoundingClientRect();
            this.targetRect = {
                top:        rect.top,
                left:       rect.left,
                width:      rect.width,
                height:     rect.height,

                absTop:     e.clientY || e.touches[0].clientY,
                absLeft:    e.clientX || e.touches[0].clientX,
                relTop:     (e.clientY || e.touches[0].clientY) - rect.top,
                relLeft:    (e.clientX || e.touches[0].clientX) - rect.left
            }
            this.#Enter(e);
        } else {
            const target = document.elementFromPoint((e.pageX || e.touches[0].pageX) - window.scrollX, (e.pageY || e.touches[0].pageY) - window.scrollY).closest(".sad-list");
            const sadInstance = SortAndDrop.instances.find(el => el.from === target);
            if(target && sadInstance && !target.children.length) {
                this.to = sadInstance;
            }
            else this.#Out(e);
        }
    }

    #Up(e) { // MOUSE UP OR TOUCH END
        this.selected = this.from.querySelectorAll(".sad-selected:not(.sad-ghost)");
        this.upTimestamp = new Date().getTime();

        if(this.relatedElement)
            [...(this.selected || []), this.relatedElement].forEach(el => Object.assign(el.style, {
                "opacity":""
            }));

        if(this.targetElement && this.relatedElement || this.to && this.relatedElement) {
            if(this.drop && this.to.onDrop) { // DROP
                this.to.onDrop({...this});
            } else { // SORT
                const canSort = (el) => {
                    return !this.to.accept || [...el.parentNode.querySelectorAll(this.to.accept)].includes(el);
                }
                if(this.beforeSort) this.beforeSort({...this});
                if(this.to.beforeSort) this.to.beforeSort({...this.to});

                if(this.relatedElement && !this.selected.length && canSort(this.relatedElement)) {
                    if(this.targetElement)
                        this.targetElement[this.sort > 0 ? "after" : "before"](this.relatedElement);
                    else
                        this.to.from.appendChild(this.relatedElement);
                }
                else if(this.selected.length && !canSort(this.relatedElement)) {}
                else {
                    let arr = [...this.selected];
                    if(!arr.includes(this.relatedElement)) arr.push(this.relatedElement);
                    
                    let firstElement = arr[0];
                    if(this.targetElement)
                        this.targetElement[this.sort > 0 ? "after" : "before"](firstElement);
                    else
                        this.to.from.appendChild(firstElement);

                    arr.reverse().forEach(el => {
                        if(canSort(el)) firstElement.after(el);
                    });
                }

                if(this.onSort) this.onSort({...this});
                if(this.to.onSort) this.to.onSort({...this.to});
            }
            this.relatedElement.scrollIntoView({behavior:"smooth", block:"nearest", inline:"nearest"});
        }
        this.#StopSorting(e);
    }

    #StopSorting() {
        if(this.ghost) this.ghost.parentNode.removeChild(this.ghost);
        if(this.placeholder) this.placeholder.parentNode.removeChild(this.placeholder);
        if(this.debug) this.debug.parentNode.removeChild(this.debug);
        if(this.pointer) this.pointer.parentNode.removeChild(this.pointer);
        this.ghost = null;
        this.placeholder = null;
        this.debug = null;
        this.pointer = null;
        this.relatedElement = null;
        this.targetElement = null;
        this.to = null;
        clearTimeout(this.selectedTimeout);
        this.#Out();
    }

    #Enter(e) { // MOUSE ENTER OR TOUCH ENTER
        this.drop = false;
        this.sort = null;
        const isDroppable = this.targetElement.className.includes("sad-droppable") && this.targetElement != this.relatedElement;
        let threshold;
        if(isDroppable) threshold = this.threshold;
        else threshold = 50;

        const parent = this.targetElement.parentNode;
        if(parent === this.from) this.to = this;
        else {
            this.to = SortAndDrop.instances.find(el => el.from === parent);
            if(!this.to) return;
        }

        const areaWidth = this.targetRect.width / 100 * threshold;
        const areaHeight = this.targetRect.height / 100 * threshold;

        const inTopArea = areaHeight >= this.targetRect.relTop && this.to.direction === "column";
        const inBottomArea = (this.targetRect.height - areaHeight) <= this.targetRect.relTop && this.to.direction === "column";
        const inLeftArea = areaWidth >= this.targetRect.relLeft && this.to.direction === "row";
        const inRightArea = (this.targetRect.width - areaWidth) <= this.targetRect.relLeft && this.to.direction === "row";

        if(inLeftArea || inTopArea) this.sort = -1; // INSERT LEFT OR TOP    
        else if(inRightArea || inBottomArea) this.sort = 1; // INSERT RIGHT OR BOTTOM
        else this.drop = true;
        this.#HandlePlaceholder();
    }
    #Out() {
        [...this.from.children].forEach(el => el.classList.remove("sad-highlight"));
        if(this.targetElement) {
            this.targetElement.classList.remove("sad-highlight");
            this.targetElement = null;
            this.targetRect = null;
        }
        if(this.placeholder) {
            this.placeholder.parentNode.removeChild(this.placeholder);
            this.placeholder = null;
        }
        if(this.debug) {
            this.debug.parentNode.removeChild(this.debug);
            this.debug = null;
        }
    }

    #SelectStart(e) {
        this.selecting = true;
        this.selectingTop = (e.pageY || e.touches[0].pageY);
        this.selectingLeft = (e.pageX || e.touches[0].pageX);

        Object.assign(this.selectPlaceholder.style, {
            top: this.selectingTop + "px",
            left:this.selectingLeft + "px"
        });
    }
    #SelectMove(e) {
        const endTop = (e.pageY || e.touches[0].pageY);
        const endLeft = (e.pageX || e.touches[0].pageX);

        const selectingHeight = endTop - this.selectingTop;
        const selectingWidth = endLeft - this.selectingLeft;
        
        const handleRect = this.selectPlaceholder.getBoundingClientRect();
        Object.assign(this.selectPlaceholder.style, {
            height: Math.abs(selectingHeight) + "px",
            width:  Math.abs(selectingWidth) + "px",
            top:    (selectingHeight >= 0 ? this.selectingTop : endTop ) + "px",
            left:   (selectingWidth >= 0 ? this.selectingLeft : endLeft ) + "px"
        });
        [...this.from.children].forEach(el => {
            const elRect = el.getBoundingClientRect();
            if(!(
                elRect.left > handleRect.right ||
                elRect.right < handleRect.left ||
                elRect.top > handleRect.bottom ||
                elRect.bottom < handleRect.top
            )) this.#SelectItem(el);
            else if(!e.ctrlKey) this.#UnselectItem(el);
        });
    }
    #SelectEnd() {
        if(this.selectPlaceholder && this.selectPlaceholder.parentNode)
            this.selectPlaceholder.parentNode.removeChild(this.selectPlaceholder);
        delete this.selectPlaceholder;
        delete this.selecting;
    }

    #SelectItem(target) {
        //clearTimeout(this.selectedTimeout);
        target.classList.add("sad-selected");
        this.#Out();
    }
    #UnselectItem(target) {
        target.classList.remove("sad-selected");
        this.#Out();
    }
    #UnselectAll() {
        [...this.from.children].forEach(el => el.classList.remove("sad-selected"));
        this.selected = null;
    }

    #Scroll() {
        if(!this.scrollableElement) return;
        const element = this.scrollableElement;
        const rect = element.getBoundingClientRect();
        const canScrollY = element.scrollHeight > element.offsetHeight;
        const canScrollX = element.scrollWidth > element.offsetWidth;
        const threshold = 10;

        if(canScrollY && !this.onScroll) { // CAN SCROLL ON Y
            const scrollY = (amount) => {
                const status = (amount > 0 ? thresholdBottom < this.cursorY : thresholdTop > this.cursorY) && this.ghost;
                element.scrollTop = element.scrollTop + amount;
                if(status) {
                    this.onScroll = true;
                    setTimeout(() => scrollY(amount), 10);
                }
                else this.onScroll = false;
            }
            const thresholdTop = (rect.top + (element.offsetHeight / 100 * threshold));
            const thresholdBottom = (element.offsetHeight - (element.offsetHeight / 100 * threshold));

            if(
                element.scrollTop > 0 && // SCROLL IS NOT AT TOP
                thresholdTop > this.cursorY // CURSOR IS AT TOP OF THE LIST
            ) { // SCROLL UP
                scrollY(-10);
            } else if( // SCROLL DOWN 
                element.scrollHeight - element.scrollTop != element.offsetHeight && // SCROLL IS NOT AT BOTTOM
                thresholdBottom < this.cursorY // CURSOR IS AT BOTTOM OF THE LIST
            ) {
                scrollY(10);
            }
        }

        if(canScrollX && !this.onScroll) { // CAN SCROLL ON X
            const scrollX = (amount) => {
                const status = (amount > 0 ? thresholdRight < this.cursorX : thresholdLeft > this.cursorX) && this.ghost;
                element.scrollLeft = element.scrollLeft + amount;
                if(status) {
                    this.onScroll = true;
                    setTimeout(() => scrollX(amount), 10);
                }
                else this.onScroll = false;
            }

            const thresholdLeft = (element.offsetLeft + (element.offsetWidth / 100 * threshold));
            const thresholdRight = (rect.width - (element.offsetWidth / 100 * threshold));
            if(
                element.scrollLeft > 0 && // SCROLL IS NOT AT LEFT
                thresholdLeft > this.cursorX // CURSOR IS AT TOP OF THE LIST
            ) { // SCROLL UP
                scrollX(-10);
            } else if( // SCROLL DOWN 
                element.scrollWidth - element.scrollLeft != element.offsetWidth && // SCROLL IS NOT AT BOTTOM
                thresholdRight < this.cursorX // CURSOR IS AT BOTTOM OF THE LIST
            ) {
                scrollX(10);
            }
        }
        
    }
    #CreateGhost() { // CREATE THE GHOST FOR DRAGGING
        this.ghost = this.relatedElement.cloneNode(true);
        this.ghost.classList.add("sad-ghost");
        Object.assign(this.ghost.style, {
            "position":         "fixed",
            "pointer-events":   "none",
            "opacity":          "0.75",
            "z-index":"999",
            "margin":"0",
            "transform-origin":"top center",
            "transition":"transform .15s ease",
            "transform": "translateY(50%)"
        });
        this.from.appendChild(this.ghost);
    }
    #CreatePlaceholder() { // CREATE THE PLACEHOLDER FOR SORTING
        this.placeholder = document.createElement("div");
        this.placeholder.classList.add("sad-placeholder");
        Object.assign(this.placeholder.style, {
            "position":         "fixed",
            "pointer-events":   "none"
        });
        document.querySelector("html").appendChild(this.placeholder);
    }
    #CreateSelectablePlaceholder() {
        let selectPlaceholder = this.selectableArea.querySelector(".sad-select-placeholder");
        if(!selectPlaceholder) {
            selectPlaceholder =  document.createElement("div");
            selectPlaceholder.classList.add("sad-select-placeholder");
            document.querySelector("html").appendChild(selectPlaceholder);
        }

        this.selectPlaceholder = selectPlaceholder;
        Object.assign(this.selectPlaceholder.style, {
            position:"fixed"
        });
    }
    #HandlePlaceholder() {
        document.querySelectorAll(".sad-highlight").forEach(el => el.classList.remove("sad-highlight"));
        if(!this.sort) {
            if(this.placeholder) {
                this.placeholder.parentNode.removeChild(this.placeholder);
                this.placeholder = null;
            }
            this.targetElement.classList.add("sad-highlight");
        } else {
            if(this.to.accept && ![...this.relatedElement.parentNode.querySelectorAll(this.to.accept)].includes(this.relatedElement)) {
                if(this.placeholder) {
                    this.placeholder.parentNode.removeChild(this.placeholder);
                    this.placeholder = null;
                } return;
            }

            if(!this.placeholder) this.#CreatePlaceholder();

            const targetStyle = this.targetElement.currentStyle || window.getComputedStyle(this.targetElement);
            let targetMargin;
            switch(this.to.direction) {
                case "row":
                    targetMargin = parseFloat(this.sort > 0 ? targetStyle.marginLeft : targetStyle.marginRight);
                    const targetTop = this.targetRect.top;
                    const placeholderLeft = this.sort > 0 ? this.targetRect.left + this.targetRect.width + targetMargin : this.targetRect.left - targetMargin;
                    Object.assign(this.placeholder.style, {
                        "top":  targetTop + "px",
                        "left": placeholderLeft - (targetMargin / 2) + "px",
                        "width": targetMargin + "px",
                        "height":this.targetRect.height + "px",
                        "border-radius":targetMargin + "px"
                    });
                break;
                case "column":
                    targetMargin = parseFloat(this.sort > 0 ? targetStyle.marginTop : targetStyle.marginBottom);
                    const targetLeft = this.targetRect.left;
                    const placeholderTop = this.sort > 0 ? this.targetRect.top + this.targetRect.height + targetMargin : this.targetRect.top - targetMargin;
                    Object.assign(this.placeholder.style, {
                        "top":  placeholderTop - (targetMargin / 2) + "px",
                        "left": targetLeft + "px",
                        "width":this.targetRect.width + "px",
                        "height": targetMargin + "px",
                        "border-radius":targetMargin + "px"
                    });
                break;
            }
        }

        this.#Debug();
    }
    #getScrollParent(includeHidden) {
        let style = getComputedStyle(this.from);
        const excludeStaticParent = style.position === "absolute";
        const overflowRegex = includeHidden ? /(auto|scroll|hidden)/ : /(auto|scroll)/;
    
        if(style.position === "fixed") return document.body;
        for(let parent = this.from; (parent = parent.parentElement);) {
            style = getComputedStyle(parent);
            if (excludeStaticParent && style.position === "static") continue;
            if (overflowRegex.test(style.overflow + style.overflowY + style.overflowX)) return parent;
        }
        return document.body;
    }

    cancel() {
        this.#SelectEnd();
        this.#StopSorting();
    }

    // DEBUG
    #Debug() {
        if(!SortAndDrop.debug) return;
        if(!this.pointer) {
            this.pointer = document.createElement("div");
            this.pointer.classList.add("sad-pointer");
            document.querySelector("html").appendChild(this.pointer);
        }
        Object.assign(this.pointer.style, {
            position:"fixed",
            "pointer-events":"none",
            opacity:0.5,
            border:"0.25em solid darkmagenta",
            opacity:1,

            top:    this.downTop - (this.thresholdMove / 2) + "px",
            left:   this.downLeft - (this.thresholdMove / 2) + "px",
            width:  this.thresholdMove + "px",
            height: this.thresholdMove + "px"
        });
        if(!this.targetElement) return;
        if(!this.debug) {
            this.debug = document.createElement("div");
            this.debug.classList.add("sad-debugger");
            const first = document.createElement("div");
            const second = document.createElement("div");

            Object.assign(first.style, {
                position:"absolute",
                background:"repeating-linear-gradient(45deg, transparent 0%, transparent 20%, #000000 20%, #000000 40%)"
            });
            Object.assign(second.style, {
                position:"absolute",
                background:"repeating-linear-gradient(45deg, #000000 40%, #000000 60%, transparent 60%, transparent 80%)"
            });

            this.debug.appendChild(first);
            this.debug.appendChild(second);
            document.querySelector("html").appendChild(this.debug);
        }
        Object.assign(this.debug.style, {
            position:"fixed",
            "pointer-events":"none",
            opacity:0.5,
            top:    this.targetRect.top + "px",
            left:   this.targetRect.left + "px",
            width:  this.targetRect.width + "px",
            height: this.targetRect.height + "px",
            display:"block"
        });
        let threshold, area, areaHeight, areaWidth, areaLeft, areaTop;
        const isDroppable = this.targetElement.className.includes("sad-droppable") && this.targetElement != this.relatedElement;
        if(isDroppable) {
            threshold = this.threshold;
        } else {
            threshold = 50;
        }
        switch(this.to.direction) {
            case "row":
                areaWidth = this.targetRect.width / 100 * threshold;
                areaHeight = this.targetRect.height;
                area = this.debug.querySelectorAll("div")[0];
                areaLeft = 0;
                areaTop = 0;
                Object.assign(area.style, {
                    top:        areaTop + "px",
                    left:       areaLeft + "px",
                    width:      areaWidth + "px",
                    height:     areaHeight + "px"
                });
                area = this.debug.querySelectorAll("div")[1];
                areaLeft = this.debug.offsetWidth - areaWidth;
                Object.assign(area.style, {
                    top:        areaTop + "px",
                    left:       areaLeft + "px",
                    width:      areaWidth + "px",
                    height:     areaHeight + "px"
                });
            break;
            case "column":
                areaWidth = this.targetRect.width;
                areaHeight = this.targetRect.height / 100 * threshold;
                area = this.debug.querySelectorAll("div")[0];
                areaLeft = 0;
                areaTop = 0;
                Object.assign(area.style, {
                    top:        areaTop + "px",
                    left:       areaLeft + "px",
                    width:      areaWidth + "px",
                    height:     areaHeight + "px"
                });
                area = this.debug.querySelectorAll("div")[1];
                areaTop = this.debug.offsetHeight - areaHeight;
                Object.assign(area.style, {
                    top:        areaTop + "px",
                    left:       areaLeft + "px",
                    width:      areaWidth + "px",
                    height:     areaHeight + "px"
                });
            break;
        }
    }
}
export { SortAndDrop };