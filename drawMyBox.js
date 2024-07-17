const arrowWidth = 13;
const arrowHeight = 5;
const defaultLength = 25;

var allGroups = [];  // This should be your array or object containing all group objects

// Assume we have an initial JSON object with group positions and IDs
var plantData = {  // This will be retrieved by a call to the back-end
    "unit_operations": [
      { 
        "id": "u0001", 
        "name": "Thickener 1", 
        "x": 50, "y": 75, "w": 100, "h": 50,
        "input_stream_ids": [
            {"stream_id": "S0001", "landingSite": "left-0.2"},
            {"stream_id": "S0005", "landingSite": "top"}
        ],
        "output_streams": [
            {"stream_id": "s0003", "name": "Thickener 1 Underflow", "attachmentSite": "left-0.7"}, 
            {"stream_id": "s0002", "name": "Thickener 1 Overflow", "attachmentSite": "right"}]
      },
      { 
        "id": "u0002", 
        "name": "Thickener 2", 
        "x": 350, "y": 75, "w": 100, "h": 50,
        "input_stream_ids": [
            {"stream_id": "S0002", "landingSite": "left-0"}],
        "output_streams": [
            {"stream_id": "s0004", "name": "Thickener 2 Overflow", "attachmentSite": "right-0.1"},
            {"stream_id": "s0005", "name": "Thickener 2 Underflow", "attachmentSite": "bottom" }]
      },
      // ... more unit_operations
    ]
  };

var draw = SVG().addTo('#drawing').size('100%', '100%');

function createDraggableGroup(data, fillColor) {
    var group = draw.group().attr({ 'data-id': data.id });
    
    // Create rectangle and text for the step
    group.rect = group.rect(data.w, data.h).attr({ fill: 'white', stroke: 'black' }).move(data.x, data.y);
    
    // Create text for the step
    group.text = group.text(data.name).attr({stroke: 'black' }).move(data.x + 25, data.y + 20);
    
    // Centering text within rectangle
    var bbox = group.text.bbox();
    group.text.move(data.x + (data.w - bbox.width) / 2, data.y + (data.h - bbox.height) / 2);

    group.data = data
    group.referencedLines = [];
    group.referencedArrows = [];
    group.referencedCircles = [];
    
    data.output_streams.forEach(function(stream, idx) {
        drawLineAndArrow(group, idx);
    });

    // Add event listeners for dragging
    group.on('mousedown', function(event) {
        startDrag(event, group);
    });
   
    return group;
}

// Function to start dragging
function startDrag(event, group) {
    deleteUnitPeripherals(group); 
    // Get the initial mouse position
    var startX = event.clientX;
    var startY = event.clientY;
    
    // Get the initial position of the group
    var groupX = group.x();
    var groupY = group.y();
    
    // Function to handle dragging (mousemove event)
    function drag(event) {
        // Calculate the new position of the group
        var dx = event.clientX - startX;
        var dy = event.clientY - startY;
        group.data.x = groupX + dx;
        group.data.y = groupY + dy;
        group.move(groupX + dx, groupY + dy);
    }

    // Function to end dragging (mouseup event)
    function endDrag() {
        // Remove the event listeners
        window.removeEventListener('mousemove', drag);
        window.removeEventListener('mouseup', endDrag);
        console.log("Commencing dragging.");
    
        // Reconnect to downstream units
        group.data.output_streams.forEach(function(stream, idx) {
            drawLineAndArrow(group, idx);
        });
    
        // Reconnect to upstream units
        group.data.input_stream_ids.forEach(function(stream, idx) {
            var stream_id = stream.stream_id;
            console.log("Searching for unit assoc with stream ID: " + stream_id);
            var unitId = findInputUnits(stream.stream_id, plantData);
            if (unitId) {
                console.log("Found unit = " + unitId);
                var groupElement = allGroups.find(group => group.attr('data-id') === unitId);
                deleteUnitPeripherals(groupElement); 
                groupElement.data.output_streams.forEach(function(stream, idx) {
                    console.log(groupElement);
                    console.log("idx " + idx + ": attempting to redraw stream_id " + stream.stream_id);
                    drawLineAndArrow(groupElement, idx);
                });
            } else {
                console.log("Unit id was null");
            }
        });
    
        // Write updated plantData back to DB/JSON object including latest positions for the dragged group
        if (plantData) {
            savePositionsToFile(plantData);
        }
    }
    
    // Add the event listeners
    window.addEventListener('mousemove', drag);
    window.addEventListener('mouseup', endDrag);
}

function findInputUnits(streamId, plantData) {
    for (let unit of plantData.unit_operations) {
        for (let stream of unit.output_streams) {
            if (stream.stream_id.toLowerCase() === streamId.toLowerCase()) {
                return unit.id;
            }
        }
    }
    return null;
}

  function findLandingXY(streamId, plantData) {
    for (let unit of plantData.unit_operations) {  // But plantData may not have been updated!!
        for (let stream of unit.input_stream_ids) {
            if (stream.stream_id.toLowerCase() === streamId.toLowerCase()) {
                let landingSide = stream.landingSite.split("-")[0];
                if (landingSide === "left") {
                    return {x: unit.x, y: unit.y + unit.h/2, landingSide: landingSide};
                } else if (landingSide === "right") {
                    return {x: unit.x + unit.w, y: unit.y + unit.h/2, landingSide: landingSide};
                } else if (landingSide === "top") {
                    return {x: unit.x + unit.w/2, y: unit.y, landingSide: landingSide};
                } else { 
                    landingSide = "bottom"
                    return {x: unit.x + unit.w/2, y: unit.y + unit.h, landingSide: landingSide};
                }
            }
        }
    }
    return {x: null, y: null, landingSide: null};
}

/*
Calculate start and end of line that connects this stream to the src and dst units.
*/
function calculateLineEndsToDischargeStream(data, idx) {
    let lineStartX, lineStartY, lineEndX, lineEndY, landingSide;
    let dischargeAttachment = data.output_streams[idx]?.attachmentSite;
    let [dischargeAttachSide, sideFraction = 0.5] = dischargeAttachment?.split("-") || [];
    sideFraction = parseFloat(sideFraction);
    // Find the attachment site to receiving unitOp
    let myStreamId = data.output_streams[idx].stream_id;
    let landingSite = findLandingXY(myStreamId, plantData);
    ({ x: lineEndX, y: lineEndY, landingSide } = landingSite);
    // Determine line start coordinates based on the discharge attachment side
    switch (dischargeAttachSide) {
        case "bottom":
            lineStartX = data.x + data.w * sideFraction;
            lineStartY = data.y + data.h;
            break;
        case "top":
            lineStartX = data.x + data.w * sideFraction;
            lineStartY = data.y;
            break;
        case "left":
            lineStartX = data.x;
            lineStartY = data.y + data.h * sideFraction;
            break;
        case "right":
            lineStartX = data.x + data.w;
            lineStartY = data.y + data.h * sideFraction;
            break;
    }
    // Handle dangling stream if lineEndX or lineEndY is null
    if (lineEndX === null || lineEndY === null) {
        console.log("Handling dangling streams");
        switch (dischargeAttachSide) {
            case "right":
                lineEndX = lineStartX + defaultLength;
                lineEndY = lineStartY;
                break;
            case "bottom":
                lineEndX = lineStartX;
                lineEndY = lineStartY + defaultLength;
                break;
            case "top":
                lineEndX = lineStartX;
                lineEndY = lineStartY - defaultLength;
                break;
            case "left":
                lineEndX = lineStartX - defaultLength;
                lineEndY = lineStartY;
                break;
        }
    }

    return { lineStartX, lineStartY, lineEndX, lineEndY, dischargeAttachSide, landingSide };
}

var allLineSegments = [];  //[{id: <some_id>, data: [[p1, q1, p2, q2], [p2, q2, p3, q3]]}]

function getNewLinesObject(guid, poly) {
    var newObj = {};
    newObj.id = guid;
    newObj.data = [];

    // Loop through the polygon points
    for (let i = 0; i < poly.length - 1; i++) {
        // Get the current and next points
        let p1 = { x: parseFloat(poly[i][0]), y: parseFloat(poly[i][1]) };
        let p2 = { x: parseFloat(poly[i + 1][0]), y: parseFloat(poly[i + 1][1]) };

        // Add the segment defined by these two points
        newObj.data.push({ p1: p1, p2: p2 });
    }
    return newObj;
}

function addToAllLines(group, poly) {
    var unit_id = group.data.unit_id
    var newObj = getNewLinesObject(unit_id, poly);
    allLineSegments.push(newObj);
    return true;
}

function deleteUnitPeripherals(group) {
    deleteItemsFromAllLineSegments(group);
    deleteLinesArrowsCirclesFromGroup(group);
}

function deleteItemsFromAllLineSegments(group) {
    // Assuming group.data.unit_id is the unique identifier for the group's lines
    var unitId = group.data.unit_id;
    
    // Filter out the lines that belong to the given group
    allLineSegments = allLineSegments.filter(line => line.id !== unitId);
}

function deleteLinesArrowsCirclesFromGroup(group) {
    console.log("Deleting lines and arrow for unit " + group.data.id);
    group.referencedLines.forEach(line => line.remove());
    group.referencedArrows.forEach(arrow => arrow.remove());
    group.referencedCircles.forEach(circle => circle.remove());
    group.referencedLines = [];
    group.referencedArrows = [];
    group.referencedCircles = [];
}


// Function to calculate the orientation of the triplet (p, q, r)
function orientor(p, q, r) {
    const val = (q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y);
    if (val === 0) return 0; // collinear
    return (val > 0) ? 1 : 2; // clock or counterclock wise
  }
  
  // Function to check if point q lies on line segment pr
  function onSegment(p, q, r) {
    return q.x <= Math.max(p.x, r.x) && q.x >= Math.min(p.x, r.x) &&
           q.y <= Math.max(p.y, r.y) && q.y >= Math.min(p.y, r.y);
  }
  
  // Function to check if line segment 'p1q1' and 'p2q2' intersect
  function doIntersect(p1, q1, p2, q2) {
    const o1 = orientor(p1, q1, p2);
    const o2 = orientor(p1, q1, q2);
    const o3 = orientor(p2, q2, p1);
    const o4 = orientor(p2, q2, q1);
  
    // General case
    if (o1 !== o2 && o3 !== o4) return true;
  
    // Special cases
    if (o1 === 0 && onSegment(p1, p2, q1)) return true;
    if (o2 === 0 && onSegment(p1, q2, q1)) return true;
    if (o3 === 0 && onSegment(p2, p1, q2)) return true;
    if (o4 === 0 && onSegment(p2, q1, q2)) return true;
  
    return false;
  }
  
  // Function to calculate intersection point of two lines (p1, q1) and (p2, q2)
  function lineIntersection(p1, q1, p2, q2) {
    const A1 = q1.y - p1.y;
    const B1 = p1.x - q1.x;
    const C1 = A1 * p1.x + B1 * p1.y;
  
    const A2 = q2.y - p2.y;
    const B2 = p2.x - q2.x;
    const C2 = A2 * p2.x + B2 * p2.y;
  
    const determinant = A1 * B2 - A2 * B1;
  
    if (determinant === 0) {
      // The lines are parallel
      return null;
    } else {
      const x = (B2 * C1 - B1 * C2) / determinant;
      const y = (A1 * C2 - A2 * C1) / determinant;
      return { x, y };
    }
  }

  function checkForCollisionWithExistingLines(proposedBridgeSection) {
    for (let i = 0; i < proposedBridgeSection.length - 1; i++) {
        const segment1 = { p1: { x: proposedBridgeSection[i][0], y: proposedBridgeSection[i][1] }, p2: { x: proposedBridgeSection[i + 1][0], y: proposedBridgeSection[i + 1][1] } };
        for (let j = 0; j < allLineSegments.length; j++) {
            const lines = allLineSegments[j].data;
            const guid = allLineSegments[j].id;
            for (let k = 0; k < lines.length; k++) {        
                const segment2 = { p1: lines[k].p1, p2: lines[k].p2 };
                if (doIntersect(segment1.p1, segment1.p2, segment2.p1, segment2.p2)) {
                    const intersection = lineIntersection(segment1.p1, segment1.p2, segment2.p1, segment2.p2);
                    if (intersection) {
                        console.log(`Collision detected between proposed section segment and line ${allLineSegments[j].id} at (${intersection.x}, ${intersection.y})`);
                        return intersection;
                    }
                }
            }
        }
    }
    return null;
}

function generateRandomString() {
    return 'xxxxxxxx'.replace(/[x]/g, function(c) {
      var r = Math.random() * 16 | 0;
      return r.toString(16);
    });
}

function drawLineAndArrow(group, idx) {
    // Calculate start positions for line inside this function
    var { lineStartX, lineStartY, lineEndX, lineEndY, dischargeAttachSide, landingSide } = calculateLineEndsToDischargeStream(group.data, idx);

    // Create a new polyline with at least 5 nodes using the SVG.js methods
    let polyCoordinates = [[lineStartX, lineStartY]]
    let extremeStartY = lineStartY;
    let insertIndex = 1;
    if (dischargeAttachSide === "bottom") {
        // insert coordinates after the first coordinates for a point that is vertically below the starting point, i.e. [lineStartX, lineStartY + defaultLength]
        extremeStartY += defaultLength;
        insertIndex += 1;
        //polyCoordinates = fiveNodeLine.slice(0, 1).concat([newPoint], fiveNodeLine.slice(1));
    } else if (dischargeAttachSide === "top") {
        extremeStartY -= defaultLength;
        insertIndex += 1;
    }
    
    let extremeEndY = lineEndY;
    let newPoint1, newPoint2;
    if (landingSide === "bottom") {
        // insert coordinates after the first coordinates for a point that is vertically below the starting point, i.e. [lineStartX, lineStartY + defaultLength]
        extremeEndY += defaultLength;
        if (dischargeAttachSide === "bottom") { // i.e. same side and landing
            extremeEndY = Math.max(extremeEndY, extremeStartY);
            extremeStartY = extremeEndY;
        }
        newPoint1 = [lineStartX, extremeStartY];
        newPoint2 = [lineEndX, extremeEndY];
        polyCoordinates = polyCoordinates.concat([newPoint1, newPoint2])
        //polyCoordinates = fiveNodeLine.slice(0, 1).concat([newPoint], fiveNodeLine.slice(1));
    } else if (landingSide === "top") {
        extremeEndY -= defaultLength;
        if (dischargeAttachSide === "top") { // i.e. same side as landingSide
            extremeEndY = Math.min(extremeEndY, extremeStartY);
            extremeStartY = extremeEndY;
        }
        newPoint1 = [lineStartX, extremeStartY];
        newPoint2 = [lineEndX, extremeEndY];
        polyCoordinates = polyCoordinates.concat([newPoint1, newPoint2])
    } 

    // Calculate midpoint for orthogonal arrangement
    let midPointX = (lineStartX + lineEndX) / 2;
    if (lineStartX < lineEndX) {
        midPointX -= 5; // or some other logic to determine the bend point
    } else {
        midPointX += 5; 
    }
    //let midPointY = (extremeStartY + extremeEndY) / 2; // or some other logic to determine the bend point
    var midPoint1 = [midPointX, extremeStartY];
    var midPoint3 = [midPointX, extremeEndY];
    var proposedBridgeSection = [midPoint1,  midPoint3]; // var midPoint2 = [midPointX, midPointY],
    polyCoordinates = polyCoordinates.slice(0, insertIndex).concat(proposedBridgeSection, polyCoordinates.slice(insertIndex));
    
    // insert final point
    var endPoint = [lineEndX, lineEndY];
    polyCoordinates = polyCoordinates.concat([endPoint]);

    addToAllLines(group, polyCoordinates);  // allLines is used when checking for collisions.

    // Check if proposed offers any clashes with existing line segments in allLines.
    let newLine;
    var result = checkForCollisionWithExistingLines(proposedBridgeSection);
    if (result) { 
        let arcStartY, arcEndY;
        if (extremeStartY < extremeEndY) {
            arcStartY = Math.max(result.y - 5, extremeStartY);
            arcEndY = Math.min(result.y + 5, extremeEndY);
        } else {
            arcStartY = Math.min(result.y + 5, extremeStartY);
            arcEndY = Math.max(result.y - 5, extremeEndY);
        }
        var arcPoint1 = [midPoint1[0], arcStartY];
        var arcPoint2 = [midPoint1[0], arcEndY];
        var pathStr = `M${lineStartX} ${lineStartY}`;
        if (newPoint1) {
            pathStr = `${pathStr} L${newPoint1[0]} ${newPoint1[1]}`;
        }
        pathStr = `${pathStr} L${midPoint1[0]} ${midPoint1[1]} L${arcPoint1[0]} ${arcPoint1[1]} M${arcPoint2[0]} ${arcPoint2[1]} L${midPoint3[0]} ${midPoint3[1]}`
        if (newPoint2) {
            pathStr = `${pathStr} L${newPoint2[0]} ${newPoint2[1]}`;
        }
        pathStr = `${pathStr} L${lineEndX} ${lineEndY}`
        newLine = group.path(pathStr).fill('none').stroke({ color: '#000', width: 2 });
    } else {
        newLine = group.polyline(polyCoordinates).fill('none').stroke({ color: '#000', width: 2 });
    }
    
    const landedSide = determineLandedSide(landingSide, dischargeAttachSide);
    var newArrow = drawArrow(group, landedSide, lineEndX, lineEndY)
    
    newArrow.fill('#000');

    // If you need to reference these later, you can assign them to properties on the group
    group.referencedLines.push(newLine);
    group.referencedArrows.push(newArrow);
}

function drawArrow(group, landedSide, lineEndX, lineEndY) {
    let newArrow;
    switch (landedSide) {
        case "right":
            newArrow = group.polygon(`0,0 ${arrowWidth},${arrowHeight} ${arrowWidth},-${arrowHeight}`);
            newArrow.move(lineEndX, lineEndY - arrowHeight);
            break;
        case "bottom":
            newArrow = group.polygon(`0,0 ${arrowHeight},0 0,-${arrowWidth} -${arrowHeight},0`);
            newArrow.move(lineEndX - arrowHeight, lineEndY);
            break;
        case "top":
            newArrow = group.polygon(`0,0 -${arrowHeight},0 0,${arrowWidth} ${arrowHeight},0`);
            newArrow.move(lineEndX - arrowHeight, lineEndY - arrowWidth);
            break;
        default: // "left"
            newArrow = group.polygon(`0,0 0,${arrowHeight} ${arrowWidth},0 0,-${arrowHeight}`);
            newArrow.move(lineEndX - arrowWidth, lineEndY - arrowHeight);
    }
    newArrow.fill('#000');
    return newArrow;
}

function determineLandedSide(landingSide, dischargeAttachSide) {
    if (landingSide !== null) {
        return landingSide;
    }
    switch (dischargeAttachSide) {
        case "right": return "left";
        case "left": return "right";
        case "top": return "bottom";
        case "bottom": return "top";
        default: return null;
    }
}

  // Function to save the updated positions to a file
  function savePositionsToFile(updatedData) {
      // Convert the JSON object to a string
      var jsonString = JSON.stringify(updatedData);
     
      // Code to save jsonString to a file
      // This will depend on your environment, e.g., Node.js, browser, etc.
      // For example, in Node.js, you might use fs.writeFileSync('path/to/file.json', jsonString);
  }
  
  // Create unit_operations from the JSON data
  plantData.unit_operations.forEach(data => {
      var grp = createDraggableGroup(data, '#000');
      allGroups.push(grp);
  });
