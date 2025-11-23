declare module 'locomotive-scroll' {
    export default class LocomotiveScroll {
        constructor(options?: any);
        update(): void;
        destroy(): void;
        scrollTo(target: string | number, options?: any): void;
        on(event: string, func: Function): void;
        off(event: string, func: Function): void;
    }
}

