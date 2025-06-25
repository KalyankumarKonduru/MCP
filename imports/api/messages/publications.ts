import { Meteor } from 'meteor/meteor';
import { MessagesCollection } from './messages';

Meteor.publish('messages', function(sessionId: string) {
  check(sessionId, String);
  return MessagesCollection.find({ sessionId });
});