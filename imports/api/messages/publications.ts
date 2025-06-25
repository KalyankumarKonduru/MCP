import { Meteor } from 'meteor/meteor';
import { check } from 'meteor/check';
import { MessagesCollection } from './messages';

Meteor.publish('messages', function(sessionId: string) {
  check(sessionId, String);
  return MessagesCollection.find({ sessionId });
});