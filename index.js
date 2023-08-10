import { SortAndDrop } from "./sort_and_drop.js";

const options = {
    droppable:'.folder',
    direction:"column",
    accept:".folder, .file",
    direction:"row",
    selectArea:"body",
    onSort:function(sort) { console.log(sort); },
    onDrop:function(sort) {
        console.log(sort);
        sort.selected.forEach(el => el.parentNode.removeChild(el));
        if(sort.relatedElement.parentNode)
            sort.relatedElement.parentNode.removeChild(sort.relatedElement);
    }
}
SortAndDrop.debug = true;
new SortAndDrop(document.querySelector(".list.items"), options);