/// <reference types="@welldone-software/why-did-you-render" />
import React from 'react';

if (process.env.NODE_ENV === 'development') {
    const whyDidYouRender = await import('@welldone-software/why-did-you-render');
    // @ts-ignore
    whyDidYouRender.default(React, {
        // Only track components with whyDidYouRender = true
        trackAllPureComponents: false,

        // Track hooks like useState, useReducer
        // trackHooks: true,

        // Track extra hooks (like Redux useSelector)
        // trackExtraHooks: [
        // [require('react-redux/lib'), 'useSelector']
        // ],

        // Show differences in values
        // logOnDifferentValues: true,

        // Collapse groups in console
        // collapseGroups: true,

        // Show owner component that caused re-render
        // logOwnerReasons: true,

        // Filter out specific components
        // include: [/^MyComponent/],
        // exclude: [/^Connect/],

        // onlyLogs: false,
        // titleColor: 'green',
        // diffNameColor: 'aqua',
    });
}
