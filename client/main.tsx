import React from 'react';
import { Meteor } from 'meteor/meteor';
import { createRoot } from 'react-dom/client';
import { App } from '/imports/ui/App';

import './main.css';

Meteor.startup(() => {
  const container = document.getElementById('react-target');
  if (container) {
    const root = createRoot(container);
    root.render(<App />);
  }
});