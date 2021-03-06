import { NodeWidgetFactory, LinkWidgetFactory } from "./WidgetFactories";
import { BaseEntity, BaseListener } from "./BaseEntity";
import { DiagramModel } from "./models/DiagramModel";
import { AbstractInstanceFactory } from "./AbstractInstanceFactory";
import * as _ from "lodash";
import { BaseModel, BaseModelListener } from "./models/BaseModel";
import { NodeModel } from "./models/NodeModel";
import { PointModel } from "./models/PointModel";
import { PortModel } from "./models/PortModel";
import { LinkModel } from "./models/LinkModel";
/**
 * @author Dylan Vorster
 */
export interface DiagramEngineListener extends BaseListener {
	nodeFactoriesUpdated?(): void;

	linkFactoriesUpdated?(): void;

	repaintCanvas?(): void;
}

/**
 * Passed as a parameter to the DiagramWidget
 */
export class DiagramEngine extends BaseEntity<DiagramEngineListener> {
	nodeFactories: { [s: string]: NodeWidgetFactory };
	linkFactories: { [s: string]: LinkWidgetFactory };
	instanceFactories: {
		[s: string]: AbstractInstanceFactory<BaseEntity<BaseListener>>;
	};

	diagramModel: DiagramModel;
	canvas: Element;
	paintableWidgets: {};
	linksThatHaveInitiallyRendered: {};
	nodesRendered: boolean;
	maxNumberPointsPerLink: number;

	constructor() {
		super();
		this.diagramModel = new DiagramModel();
		this.nodeFactories = {};
		this.linkFactories = {};
		this.instanceFactories = {};
		this.canvas = null;
		this.paintableWidgets = null;
		this.linksThatHaveInitiallyRendered = {};
	}

	repaintCanvas() {
		this.iterateListeners(listener => {
			listener.repaintCanvas && listener.repaintCanvas();
		});
	}

	clearRepaintEntities() {
		this.paintableWidgets = null;
	}

	enableRepaintEntities(entities: BaseModel<BaseModelListener>[]) {
		this.paintableWidgets = {};
		entities.forEach(entity => {
			//if a node is requested to repaint, add all of its links
			if (entity instanceof NodeModel) {
				_.forEach(entity.getPorts(), port => {
					_.forEach(port.getLinks(), link => {
						this.paintableWidgets[link.getID()] = true;
					});
				});
			}

			if (entity instanceof PointModel) {
				this.paintableWidgets[entity.getLink().getID()] = true;
			}

			this.paintableWidgets[entity.getID()] = true;
		});
	}

	/**
	 * Checks to see if a model is locked by running through
	 * its parents to see if they are locked first
	 */
	isModelLocked(model: BaseEntity<BaseListener>) {
		//always check the diagram model
		if (this.diagramModel.isLocked()) {
			return true;
		}

		//a point is locked, if its model is locked
		if (model instanceof PortModel) {
			if (model.getParent().isLocked()) {
				return true;
			}
		}

		//a point is locked, if its model is locked
		if (model instanceof PointModel) {
			if (model.getLink().isLocked()) {
				return true;
			}
		}

		return model.isLocked();
	}

	recalculatePortsVisually() {
		this.nodesRendered = false;
		this.linksThatHaveInitiallyRendered = {};
	}

	canEntityRepaint(baseModel: BaseModel<BaseModelListener>) {
		//no rules applied, allow repaint
		if (this.paintableWidgets === null) {
			return true;
		}

		return this.paintableWidgets[baseModel.getID()] !== undefined;
	}

	setCanvas(canvas: Element | null) {
		this.canvas = canvas;
	}

	setDiagramModel(model: DiagramModel) {
		this.diagramModel = model;
		this.recalculatePortsVisually();
	}

	getDiagramModel(): DiagramModel {
		return this.diagramModel;
	}

	getNodeFactories(): { [s: string]: NodeWidgetFactory } {
		return this.nodeFactories;
	}

	getLinkFactories(): { [s: string]: LinkWidgetFactory } {
		return this.linkFactories;
	}

	getInstanceFactory(className: string): AbstractInstanceFactory<BaseEntity<BaseListener>> {
		return this.instanceFactories[className];
	}

	registerInstanceFactory(factory: AbstractInstanceFactory<BaseEntity<BaseListener>>) {
		this.instanceFactories[factory.getName()] = factory;
	}

	registerNodeFactory(factory: NodeWidgetFactory) {
		this.nodeFactories[factory.getType()] = factory;
		this.iterateListeners(listener => {
			if (listener.nodeFactoriesUpdated) {
				listener.nodeFactoriesUpdated();
			}
		});
	}

	registerLinkFactory(factory: LinkWidgetFactory) {
		this.linkFactories[factory.getType()] = factory;
		this.iterateListeners(listener => {
			if (listener.linkFactoriesUpdated) {
				listener.linkFactoriesUpdated();
			}
		});
	}

	getFactoryForNode(node: NodeModel): NodeWidgetFactory | null {
		if (this.nodeFactories[node.getType()]) {
			return this.nodeFactories[node.getType()];
		}
		console.log("cannot find widget factory for node of type: [" + node.getType() + "]");
		return null;
	}

	getFactoryForLink(link: LinkModel): LinkWidgetFactory | null {
		if (this.linkFactories[link.getType()]) {
			return this.linkFactories[link.getType()];
		}
		console.log("cannot find widget factory for link of type: [" + link.getType() + "]");
		return null;
	}

	generateWidgetForLink(link: LinkModel): JSX.Element | null {
		var linkFactory = this.getFactoryForLink(link);
		if (!linkFactory) {
			throw new Error("Cannot find link factory for link: " + link.getType());
		}
		return linkFactory.generateReactWidget(this, link);
	}

	generateWidgetForNode(node: NodeModel): JSX.Element | null {
		var nodeFactory = this.getFactoryForNode(node);
		if (!nodeFactory) {
			throw new Error("Cannot find widget factory for node: " + node.getType());
		}
		return nodeFactory.generateReactWidget(this, node);
	}

	getRelativeMousePoint(event): { x: number; y: number } {
		var point = this.getRelativePoint(event.clientX, event.clientY);
		return {
			x: (point.x - this.diagramModel.getOffsetX()) / (this.diagramModel.getZoomLevel() / 100.0),
			y: (point.y - this.diagramModel.getOffsetY()) / (this.diagramModel.getZoomLevel() / 100.0)
		};
	}

	getRelativePoint(x, y) {
		var canvasRect = this.canvas.getBoundingClientRect();
		return { x: x - canvasRect.left, y: y - canvasRect.top };
	}

	getNodePortElement(port: PortModel): any {
		var selector = this.canvas.querySelector(
			'.port[data-name="' + port.getName() + '"][data-nodeid="' + port.getParent().getID() + '"]'
		);
		if (selector === null) {
			throw new Error(
				"Cannot find Node Port element with nodeID: [" +
					port.getParent().getID() +
					"] and name: [" +
					port.getName() +
					"]"
			);
		}
		return selector;
	}

	getPortCenter(port: PortModel) {
		var sourceElement = this.getNodePortElement(port);
		var sourceRect = sourceElement.getBoundingClientRect();

		var rel = this.getRelativePoint(sourceRect.left, sourceRect.top);

		return {
			x:
				sourceElement.offsetWidth / 2 +
				(rel.x - this.diagramModel.getOffsetX()) / (this.diagramModel.getZoomLevel() / 100.0),
			y:
				sourceElement.offsetHeight / 2 +
				(rel.y - this.diagramModel.getOffsetY()) / (this.diagramModel.getZoomLevel() / 100.0)
		};
	}

	getMaxNumberPointsPerLink(): number {
		return this.maxNumberPointsPerLink;
	}
	setMaxNumberPointsPerLink(max: number) {
		this.maxNumberPointsPerLink = max;
	}

	zoomToFit() {
		const xFactor = this.canvas.clientWidth / this.canvas.scrollWidth;
		const yFactor = this.canvas.clientHeight / this.canvas.scrollHeight;
		const zoomFactor = xFactor < yFactor ? xFactor : yFactor;

		this.diagramModel.setZoomLevel(this.diagramModel.getZoomLevel() * zoomFactor);
		this.diagramModel.setOffset(0, 0);
		this.repaintCanvas();
	}
}
